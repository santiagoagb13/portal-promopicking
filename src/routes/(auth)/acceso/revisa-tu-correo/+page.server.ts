import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies }) => ({
	title: 'Revisa tu correo',
	domain: cookies.get('acceso_dominio') ?? null
});
