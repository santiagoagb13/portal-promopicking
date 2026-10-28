/**
 * Better Auth (sección 5 del plan): passkeys, enlace mágico de respaldo, sesiones en Postgres.
 * Sin contraseñas ni registro abierto: las cuentas nacen solo al aceptar una invitación.
 */
import { randomUUID } from 'node:crypto';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { and, eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { acceptName } from '$lib/schemas/invitation';
import { audit } from '../audit';
import { modoPruebas } from './demo';
import { deviceLabel } from './device';
export { deviceLabel } from './device';
import { config } from '../config';
import { db, currentDb, tables } from '../db';
import { sendMail } from '../mail';
import { magicLinkMail } from '../mail/templates';
import { acceptInvitation, findInvitationByToken, InvitationError } from '../services/invitations';

const { users, sessions, accounts, verifications, passkeys } = tables;

/** Inactividad máxima de una sesión (se renueva con el uso cada 15 min). */
export const SESSION_IDLE_SECONDS = 60 * 60 * 12;
/** Caducidad absoluta de cualquier sesión. */
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 30;
/** Inactividad máxima para administración. */
export const ADMIN_IDLE_SECONDS = 60 * 60 * 8;

/** Contexto de la ceremonia de registro con invitación: el token y el nombre confirmado. */
export type InvitationContext = { t: string; n: string };

export function parseInvitationContext(
	context: string | null | undefined
): InvitationContext | null {
	if (!context) return null;
	try {
		const v = JSON.parse(context) as Partial<InvitationContext>;
		return typeof v.t === 'string' && typeof v.n === 'string' ? { t: v.t, n: v.n } : null;
	} catch {
		return null;
	}
}

function meta() {
	try {
		const event = getRequestEvent();
		return { ip: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') };
	} catch {
		return { ip: null, userAgent: null };
	}
}

function createAuth() {
	const origin = config.authOrigin;
	return betterAuth({
		appName: 'Portal de servicio Promopicking',
		baseURL: origin,
		basePath: '/api/auth',
		secret: config.authSecret,
		trustedOrigins: [origin],
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user: users,
				session: sessions,
				account: accounts,
				verification: verifications,
				passkey: passkeys
			},
			transaction: true
		}),
		user: {
			additionalFields: {
				role: { type: 'string', required: true, input: false },
				status: { type: 'string', required: false, input: false, defaultValue: 'active' },
				organization: { type: 'string', required: false, input: false },
				lastSeenAt: { type: 'date', required: false, input: false }
			}
		},
		emailAndPassword: { enabled: false },
		session: {
			expiresIn: SESSION_IDLE_SECONDS,
			updateAge: 60 * 15,
			cookieCache: { enabled: false }
		},
		// El límite de intentos lo aplica `hooks.server.ts` sobre Postgres (ver ADR 0002).
		rateLimit: { enabled: false },
		disabledPaths: [
			'/update-user',
			'/change-email',
			'/delete-user',
			'/list-accounts',
			'/sign-up/email'
		],
		advanced: {
			useSecureCookies: origin.startsWith('https://'),
			database: { generateId: () => randomUUID() },
			ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] }
		},
		databaseHooks: {
			session: {
				create: {
					// Una cuenta suspendida no puede abrir sesión por ninguna vía.
					before: async (session) => {
						const [u] = await currentDb()
							.select({ status: users.status })
							.from(users)
							.where(eq(users.id, session.userId));
						if (!u || u.status !== 'active') return false;
						return { data: session };
					}
				}
			}
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				const m = meta();
				const newSession = ctx.context.newSession;
				if (ctx.path === '/passkey/verify-authentication' && newSession) {
					const credentialId = (ctx.body as { response?: { id?: string } })?.response?.id;
					if (credentialId)
						await db
							.update(passkeys)
							.set({ lastUsedAt: new Date() })
							.where(
								and(
									eq(passkeys.credentialID, credentialId),
									eq(passkeys.userId, newSession.user.id)
								)
							);
					await audit({
						userId: newSession.user.id,
						action: 'auth.sign_in',
						after: { method: 'passkey' },
						...m
					});
				} else if (ctx.path === '/magic-link/verify' && newSession) {
					await audit({
						userId: newSession.user.id,
						action: 'auth.sign_in',
						after: { method: 'magic_link' },
						...m
					});
				} else if (ctx.path === '/passkey/delete-passkey' && ctx.context.session) {
					await audit({
						userId: ctx.context.session.user.id,
						action: 'passkey.deleted',
						entity: 'passkey',
						entityId: (ctx.body as { id?: string })?.id,
						...m
					});
				}
			})
		},
		plugins: [
			passkey({
				rpID: new URL(origin).hostname,
				rpName: 'Portal Promopicking',
				origin,
				authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
				registration: {
					// Con invitación se registra la passkey antes de que exista la cuenta.
					requireSession: false,
					resolveUser: async ({ context }) => {
						const ic = parseInvitationContext(context);
						const inv = ic ? await findInvitationByToken(ic.t) : null;
						if (!ic || !inv || inv.state !== 'pending')
							throw new APIError('BAD_REQUEST', { message: 'Invitación no válida o caducada' });
						const name = acceptName.safeParse(ic.n);
						return {
							id: randomUUID(),
							name: inv.email,
							displayName: name.success ? name.data : (inv.name ?? inv.email)
						};
					},
					afterVerification: async ({ ctx, user, context }) => {
						const m = meta();
						const ic = parseInvitationContext(context);
						if (!ic) {
							const userId = ctx.context.session?.user.id ?? user.id;
							await audit({ userId, action: 'passkey.added', ...m });
							return { name: deviceLabel(m.userAgent) };
						}
						const name = acceptName.safeParse(ic.n);
						try {
							await acceptInvitation({
								token: ic.t,
								userId: user.id,
								name: name.success ? name.data : '',
								...m
							});
						} catch (e) {
							if (e instanceof InvitationError)
								throw new APIError('BAD_REQUEST', { message: e.message });
							throw e;
						}
						await audit({ userId: user.id, action: 'passkey.added', ...m });
						return { userId: user.id, name: deviceLabel(m.userAgent) };
					}
				}
			}),
			magicLink({
				expiresIn: 60 * 10,
				disableSignUp: true,
				storeToken: 'hashed',
				sendMagicLink: async ({ email, url }) => {
					const [u] = await db
						.select({ id: users.id, status: users.status })
						.from(users)
						.where(eq(users.email, email.toLowerCase()));
					// Sin cuenta activa no se envía nada, pero la respuesta es la misma.
					if (!u || u.status !== 'active') return;
					await sendMail(magicLinkMail({ to: email, url }));
					await audit({ userId: u.id, action: 'auth.magic_link_sent', ...meta() });
				}
			}),
			modoPruebas(),
			sveltekitCookies(getRequestEvent)
		]
	});
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Instancia perezosa: la configuración se lee del entorno en tiempo de ejecución. */
export function getAuth(): Auth {
	return (instance ??= createAuth());
}
