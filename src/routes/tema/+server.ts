import { redirect } from '@sveltejs/kit';
import { themeInput } from '$lib/schemas/auth';
import type { RequestHandler } from './$types';

/** Guarda el tema en una cookie (no hace falta sesión: también vale en las pantallas de acceso). */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const form = await request.formData();
	const theme = themeInput.catch('system').parse(form.get('tema'));
	cookies.set('tema', theme, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:'
	});
	if (request.headers.get('accept')?.includes('application/json')) return new Response(null, { status: 204 });
	const back = String(form.get('volver') ?? '/');
	redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/');
};
