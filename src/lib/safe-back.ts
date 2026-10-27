/** Destino tras entrar: solo rutas internas del portal. */
export function safeBack(v: string | null | undefined): string {
	return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') && !v.startsWith('/api/')
		? v
		: '/campanas';
}
