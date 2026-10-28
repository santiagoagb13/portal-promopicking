import type { RequestEvent } from '@sveltejs/kit';
import { loadActor } from './actor';
import { getAuth } from './index';

/** Abre sesión como un perfil de ejemplo (solo modo pruebas) y la deja en `locals`. */
export async function enterDemo(event: RequestEvent, userId: string) {
	try {
		const { session } = await getAuth().api.entrarModoPruebas({
			body: { userId },
			headers: event.request.headers
		});
		const user = await loadActor(session.userId);
		if (!user) return;
		event.locals.user = user;
		event.locals.session = {
			id: session.id,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			expiresAt: session.expiresAt
		};
	} catch (e) {
		// Sin seed (perfil inexistente) la demo se queda en la pantalla de acceso.
		console.warn('[modo pruebas] no se pudo entrar:', (e as Error).message);
	}
}
