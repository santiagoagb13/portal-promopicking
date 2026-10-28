import { error, redirect } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import { isDemoProfile } from '$lib/server/auth/demo';
import { enterDemo } from '$lib/server/auth/demo-session';
import { config } from '$lib/server/config';
import type { RequestHandler } from './$types';

/** «Ver como» del modo pruebas: cambia la sesión a otro perfil de ejemplo y vuelve a la página. */
export const POST: RequestHandler = async (event) => {
	if (!config.demo) error(404, 'No encontrado');
	const form = await event.request.formData();
	const profile = String(form.get('perfil') ?? '');
	if (!isDemoProfile(profile)) error(400, 'Perfil no válido');
	if (event.locals.session)
		await getAuth()
			.api.signOut({ headers: event.request.headers })
			.catch(() => undefined);
	await enterDemo(event, profile);
	await audit({ userId: profile, action: 'auth.demo_profile', after: { profile } });
	// Solo rutas propias: nada de redirecciones a otro sitio.
	const back = String(form.get('volver') ?? '');
	redirect(303, back.startsWith('/') && !back.startsWith('//') ? back : '/campanas');
};
