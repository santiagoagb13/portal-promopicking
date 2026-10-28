import { getSettings } from '$lib/server/services/settings';
import type { PageServerLoad } from './$types';

// Página informativa sin JS; pública para que se pueda leer antes de entrar (plan, 4.3 y 9.3).
export const csr = false;

export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=300' });
	return { title: 'Aviso legal y privacidad', company: (await getSettings()).company };
};
