import { createHash } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { safeBack } from '$lib/safe-back';
import { emailInput } from '$lib/schemas/auth';
import { getAuth } from '$lib/server/auth';
import { hit, padTo } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	title: 'Acceso',
	back: safeBack(url.searchParams.get('volver')),
	linkError: url.searchParams.has('error')
});

/** Tiempo mínimo de respuesta: igual exista o no la cuenta (4.3). */
const MIN_MS = 900;

export const actions: Actions = {
	enlace: async ({ request, url, cookies }) => {
		const start = Date.now();
		const form = await request.formData();
		const parsed = emailInput.safeParse(form.get('email'));
		if (!parsed.success) return fail(400, { email: String(form.get('email') ?? ''), error: parsed.error.issues[0]?.message });
		const email = parsed.data;
		const back = safeBack(String(form.get('volver') ?? url.searchParams.get('volver') ?? ''));
		// Límite por cuenta (además del de IP en hooks): 5 enlaces cada 15 min.
		const perAccount = await hit(`email:ml:${createHash('sha256').update(email).digest('hex')}`, 5, 900);
		if (perAccount.ok) {
			try {
				await getAuth().api.signInMagicLink({
					body: { email, callbackURL: `/bienvenida?volver=${encodeURIComponent(back)}`, errorCallbackURL: '/acceso?error=enlace' },
					headers: request.headers
				});
			} catch (e) {
				console.error('No se pudo enviar el enlace de acceso', e);
			}
		}
		await padTo(start, MIN_MS);
		cookies.set('acceso_dominio', email.split('@')[1] ?? '', {
			path: '/acceso',
			maxAge: 600,
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:'
		});
		redirect(303, '/acceso/revisa-tu-correo');
	}
};
