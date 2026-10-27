import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

/** Cliente de Better Auth: solo para las ceremonias WebAuthn (registrar y usar passkeys). */
export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [passkeyClient()] });

export function passkeysSupported(): boolean {
	return typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials;
}

/** Mensaje legible para los errores de la ceremonia WebAuthn. */
export function passkeyError(e: unknown): string {
	const name = (e as { name?: string })?.name;
	if (name === 'NotAllowedError' || name === 'AbortError') return 'Se canceló la passkey';
	if (name === 'InvalidStateError') return 'Ese dispositivo ya tiene una passkey aquí';
	return 'No se pudo usar la passkey';
}
