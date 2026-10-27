import { env } from '$env/dynamic/private';

/** Configuración leída del entorno en cada acceso (Vercel y el VPS inyectan variables en tiempo de ejecución). */
export const config = {
	get production() {
		return env.NODE_ENV === 'production' && env.PORTAL_ENTORNO !== 'pruebas';
	},
	get authSecret() {
		const secret = env.AUTH_SECRET;
		if (!secret || secret.length < 32) throw new Error('AUTH_SECRET falta o tiene menos de 32 caracteres');
		return secret;
	},
	get authOrigin() {
		return (env.AUTH_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
	},
	get mailProvider() {
		return (env.MAIL_PROVIDER ?? '') as '' | 'resend' | 'smtp';
	},
	get mailFrom() {
		return env.MAIL_FROM ?? 'Portal Promopicking <portal@localhost>';
	},
	get mailOutboxDir() {
		return env.MAIL_OUTBOX_DIR ?? '.mail';
	},
	/** Fecha de referencia de los datos de prueba (22/10/2026). Vacía en producción: se usa la real. */
	get referenceDate() {
		return env.APP_REFERENCE_DATE || undefined;
	}
};

export function serverEnv(name: string): string | undefined {
	return env[name];
}
