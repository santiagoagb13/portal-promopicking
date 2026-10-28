import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** Configuración leída del entorno en cada acceso (Vercel y el VPS inyectan variables en tiempo de ejecución). */
export const config = {
	get production() {
		return env.NODE_ENV === 'production' && env.PORTAL_ENTORNO !== 'pruebas';
	},
	/**
	 * Modo pruebas (ADR 0013): se entra sin login como uno de los perfiles de ejemplo y se cambia
	 * de perfil desde el aviso de arriba. Solo con datos de prueba; se apaga quitando la variable.
	 */
	get demo() {
		return env.PORTAL_DEMO === '1';
	},
	get authSecret() {
		const secret = env.AUTH_SECRET;
		if (secret && secret.length >= 32) return secret;
		// En modo pruebas, sin AUTH_SECRET se deriva una de la cadena de la base de datos (que ya es
		// secreta): un paso menos al publicar la demo. Nunca fuera del modo pruebas.
		if (this.demo && env.DATABASE_URL)
			return createHash('sha256').update(`portal-pruebas:${env.DATABASE_URL}`).digest('base64');
		throw new Error('AUTH_SECRET falta o tiene menos de 32 caracteres');
	},
	get authOrigin() {
		if (env.AUTH_ORIGIN) return env.AUTH_ORIGIN.replace(/\/$/, '');
		// En Vercel, sin AUTH_ORIGIN: el dominio de producción o el de la previsualización.
		if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL)
			return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
		if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
		return 'http://localhost:5173';
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
	/**
	 * Fecha de referencia de los datos de prueba (22/10/2026). Vacía en producción: se usa la real.
	 * En modo pruebas se fija por defecto para que el seed no «envejezca» con los días.
	 */
	get referenceDate() {
		return env.APP_REFERENCE_DATE || (this.demo ? '2026-10-22' : undefined);
	}
};

export function serverEnv(name: string): string | undefined {
	return env[name];
}
