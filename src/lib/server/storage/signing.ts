import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

/** Firma HMAC de las URL del almacenamiento local (`/archivos/...`). */
export function sign(parts: string[]): string {
	return createHmac('sha256', config.authSecret).update(parts.join('\n')).digest('base64url');
}

export function verify(parts: string[], signature: string | null): boolean {
	if (!signature) return false;
	const a = Buffer.from(sign(parts));
	const b = Buffer.from(signature);
	return a.length === b.length && timingSafeEqual(a, b);
}
