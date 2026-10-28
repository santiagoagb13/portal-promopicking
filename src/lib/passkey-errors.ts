/** Ayudas de passkeys sin el cliente de Better Auth (que pesa ~16 KB y se carga al usarlo). */

export function passkeysSupported(): boolean {
	return (
		typeof window !== 'undefined' && 'PublicKeyCredential' in window && !!navigator.credentials
	);
}

/** Mensaje legible para los errores de la ceremonia WebAuthn. */
export function passkeyError(e: unknown): string {
	const name = (e as { name?: string })?.name;
	if (name === 'NotAllowedError' || name === 'AbortError') return 'Se canceló la passkey';
	if (name === 'InvalidStateError') return 'Ese dispositivo ya tiene una passkey aquí';
	return 'No se pudo usar la passkey';
}
