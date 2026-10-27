import { redirect } from '@sveltejs/kit';
import { audit, requestMeta } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (locals.user) {
		await audit({
			userId: locals.user.id,
			action: 'auth.sign_out',
			...requestMeta(request, getClientAddress())
		});
		await getAuth().api.signOut({ headers: request.headers });
	}
	redirect(303, '/acceso');
};
