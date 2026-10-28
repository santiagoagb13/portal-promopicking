import { building } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { sql } from 'drizzle-orm';
import { can } from '$lib/permissions';
import { themeInput } from '$lib/schemas/auth';
import { audit } from '$lib/server/audit';
import { loadActor } from '$lib/server/auth/actor';
import { AUTH_LIMITS, CAMERA_PATHS, isPublic, sectionAction } from '$lib/server/auth/guards';
import { ADMIN_IDLE_SECONDS, getAuth, SESSION_ABSOLUTE_SECONDS } from '$lib/server/auth';
import { DEMO_DEFAULT } from '$lib/server/auth/demo';
import { enterDemo } from '$lib/server/auth/demo-session';
import { config } from '$lib/server/config';
import { db, tables } from '$lib/server/db';
import { hit, sweep } from '$lib/server/rate-limit';

/** Tema elegido (cookie, sin JS de arranque): «system» deja decidir a `prefers-color-scheme`. */
const handleTheme: Handle = async ({ event, resolve }) => {
	const parsed = themeInput.safeParse(event.cookies.get('tema'));
	event.locals.theme = parsed.success ? parsed.data : 'system';
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%portal.theme%', event.locals.theme)
	});
};

/** Límite de intentos por IP en acceso, invitación, enlace mágico y passkeys (sección 4.3). */
const handleRateLimit: Handle = async ({ event, resolve }) => {
	const method = event.request.method;
	const path = event.url.pathname;
	const rule = AUTH_LIMITS.find(([r]) => r.test(path));
	const limited = rule && (method === 'POST' || rule[1] === 'mlv' || rule[1] === 'inv');
	if (rule && limited) {
		const [, group, max, windowS] = rule;
		const res = await hit(`ip:${group}:${event.getClientAddress()}`, max, windowS);
		if (Math.random() < 0.02) sweep().catch(() => {});
		if (!res.ok) {
			const retry = Math.max(1, Math.ceil((res.resetAt.getTime() - Date.now()) / 1000));
			return new Response('Demasiados intentos. Espera unos minutos.', {
				status: 429,
				headers: { 'retry-after': String(retry), 'content-type': 'text/plain; charset=utf-8' }
			});
		}
	}
	return resolve(event);
};

/** Sesión de Better Auth + usuario con su ámbito; caducidades por rol (sección 4.3). */
const handleSession: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;
	if (building) return resolve(event);
	const auth = getAuth();
	if (!event.url.pathname.startsWith('/api/auth/')) {
		const found = await auth.api.getSession({ headers: event.request.headers });
		if (found) {
			const now = Date.now();
			const { session } = found;
			const user = await loadActor(session.userId);
			const absoluteExpired = now - session.createdAt.getTime() > SESSION_ABSOLUTE_SECONDS * 1000;
			const adminIdle =
				user?.role === 'admin' && now - session.updatedAt.getTime() > ADMIN_IDLE_SECONDS * 1000;
			if (!user || user.status !== 'active' || absoluteExpired || adminIdle) {
				await auth.api.revokeSession({
					headers: event.request.headers,
					body: { token: session.token }
				});
				await audit({
					userId: session.userId,
					action: 'auth.session_expired',
					after: {
						reason:
							!user || user.status !== 'active'
								? 'suspended'
								: absoluteExpired
									? 'absolute'
									: 'admin_idle'
					}
				});
			} else {
				event.locals.user = user;
				event.locals.session = {
					id: session.id,
					createdAt: session.createdAt,
					updatedAt: session.updatedAt,
					expiresAt: session.expiresAt
				};
				// Última actividad, como mucho una escritura cada 15 min.
				await db
					.update(tables.users)
					.set({ lastSeenAt: new Date() })
					.where(
						sql`${tables.users.id} = ${user.id} and (${tables.users.lastSeenAt} is null or ${tables.users.lastSeenAt} < now() - interval '15 minutes')`
					);
			}
		}
	}
	// Modo pruebas: quien llega sin sesión entra como el perfil por defecto (ADR 0013).
	if (
		config.demo &&
		!event.locals.user &&
		event.request.method === 'GET' &&
		!event.url.pathname.startsWith('/api/') &&
		event.url.pathname !== '/salud'
	)
		await enterDemo(event, DEMO_DEFAULT);
	return svelteKitHandler({ event, resolve, auth, building });
};

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });

/**
 * Acceso por ruta: sin sesión → /acceso; sin permiso de sección, las peticiones que cambian algo
 * se rechazan aquí (403) y las páginas las rechaza el layout de (app) con su página de error.
 */
const handleGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const user = event.locals.user;
	if (!event.route.id) return resolve(event);
	if (!isPublic(path)) {
		if (!user) {
			if (event.request.method !== 'GET') return new Response('Sesión caducada', { status: 401 });
			const back = path === '/' ? '' : `?volver=${encodeURIComponent(path + event.url.search)}`;
			return seeOther(`/acceso${back}`);
		}
		const action = sectionAction(path);
		if (action && !can(user, action) && event.request.method !== 'GET')
			return new Response('Sin permiso', { status: 403 });
	} else if (user && (path === '/acceso' || path.startsWith('/invitacion/'))) {
		return seeOther('/campanas');
	}
	return resolve(event);
};

/** Cabeceras de seguridad y de caché (la CSP con nonce la pone SvelteKit; ver svelte.config.js). */
const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const h = response.headers;
	const https =
		event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https';
	if (https) h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
	h.set('x-content-type-options', 'nosniff');
	// La demo es pública y sin login: que no la indexe nadie.
	if (config.demo) h.set('x-robots-tag', 'noindex, nofollow');
	h.set('referrer-policy', 'strict-origin-when-cross-origin');
	h.set('x-frame-options', 'DENY');
	h.set('cross-origin-opener-policy', 'same-origin');
	h.set('cross-origin-resource-policy', 'same-origin');
	const cameraRoute = CAMERA_PATHS.some((r) => r.test(event.url.pathname));
	const camera = cameraRoute ? 'camera=(self)' : 'camera=()';
	// El lector de respaldo (zxing-wasm) compila WebAssembly: solo se permite en las rutas con cámara.
	const csp = h.get('content-security-policy');
	if (cameraRoute && csp)
		h.set(
			'content-security-policy',
			csp.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
		);
	h.set(
		'permissions-policy',
		`${camera}, microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()`
	);
	// Nada con sesión ni de acceso se guarda en cachés compartidas (9.3).
	const sensitive =
		event.locals.session || isPublic(event.url.pathname) || event.url.pathname.startsWith('/api/');
	if (sensitive && !event.url.pathname.startsWith('/_app/'))
		h.set('cache-control', 'private, no-store');
	return response;
};

export const handle = sequence(
	handleHeaders,
	handleTheme,
	handleRateLimit,
	handleSession,
	handleGuard
);

export const handleError: HandleServerError = ({ error: e, status }) => {
	if (status !== 404) console.error(e);
	return { message: status === 404 ? 'Página no encontrada' : 'Algo ha fallado' };
};
