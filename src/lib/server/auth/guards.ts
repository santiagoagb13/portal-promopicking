import type { Action } from '$lib/permissions';

/** Rutas sin sesión. Todo lo demás exige haber entrado. */
export const PUBLIC_PATHS = [
	/^\/acceso(\/|$)/,
	/^\/invitacion\//,
	/^\/api\/auth\//,
	/^\/tema$/,
	// Landing del QR de versión (5.5) y aviso legal: las rutas de la aplicación sin sesión.
	/^\/qr\/[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
	/^\/aviso-legal$/,
	// Comprobación de salud para Docker y la monitorización (no devuelve datos).
	/^\/salud$/
];

/** Permiso mínimo por sección, comprobado en `hooks.server.ts` antes de cualquier carga. */
export const SECTION_ACTION: [RegExp, Action][] = [
	[/^\/admin\/auditoria(\/|$)/, 'audit.view'],
	[/^\/admin\/ajustes(\/|$)/, 'settings.edit'],
	[/^\/maestro\/importar(\/|$)/, 'restaurant.import'],
	[/^\/maestro\/exportar/, 'restaurant.view'],
	[/^\/admin(\/|$)/, 'user.invite'],
	[/^\/campanas\/nueva(\/|$)/, 'campaign.create'],
	[/^\/campanas(\/|$)/, 'campaign.view'],
	[/^\/aprobaciones(\/|$)/, 'artwork.view'],
	[/^\/kits\/recepcion(\/|$)/, 'kit.receive'],
	[/^\/kits\/escaneo(\/|$)/, 'kit.scan'],
	[/^\/kits(\/|$)/, 'kit.view'],
	[/^\/qr(\/|$)/, 'qr.view'],
	[/^\/reposiciones(\/|$)/, 'order.place'],
	[/^\/informes(\/|$)/, 'report.view'],
	[/^\/maestro(\/|$)/, 'restaurant.view'],
	[/^\/soporte(\/|$)/, 'ticket.view']
];

export function isPublic(pathname: string): boolean {
	return PUBLIC_PATHS.some((r) => r.test(pathname));
}

export function sectionAction(pathname: string): Action | undefined {
	return SECTION_ACTION.find(([r]) => r.test(pathname))?.[1];
}

/** Rutas con cámara (Permissions-Policy). */
export const CAMERA_PATHS = [/^\/kits\/recepcion(\/|$)/, /^\/kits\/escaneo(\/|$)/];

/** Límites de intentos por IP en los puntos de acceso (5 por 15 min salvo indicación). */
export const AUTH_LIMITS: [RegExp, string, number, number][] = [
	[/^\/api\/auth\/sign-in\/magic-link$/, 'ml', 5, 900],
	[/^\/api\/auth\/magic-link\/verify$/, 'mlv', 10, 900],
	[/^\/api\/auth\/passkey\/generate-authenticate-options$/, 'pka', 30, 900],
	[/^\/api\/auth\/passkey\/verify-authentication$/, 'pkv', 10, 900],
	[/^\/api\/auth\/passkey\/generate-register-options$/, 'pkr', 10, 900],
	[/^\/api\/auth\/passkey\/verify-registration$/, 'pkrv', 10, 900],
	[/^\/invitacion\//, 'inv', 20, 900],
	[/^\/acceso$/, 'acc', 10, 900],
	[/^\/qr\/[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, 'qr', 20, 900]
];
