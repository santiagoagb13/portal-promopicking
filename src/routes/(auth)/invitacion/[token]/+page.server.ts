import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { acceptName } from '$lib/schemas/invitation';
import { getAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import {
	acceptInvitation,
	findInvitationByToken,
	InvitationError,
	requestNewInvitation
} from '$lib/server/services/invitations';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const inv = await findInvitationByToken(params.token);
	if (!inv) return { title: 'Invitación', state: 'invalid' as const };
	return {
		title: 'Invitación',
		state: inv.state,
		email: inv.email,
		name: inv.name ?? '',
		inviter: inv.inviter,
		access: inv.access,
		expiresAt: inv.expiresAt.toISOString()
	};
};

export const actions: Actions = {
	/** Respaldo sin passkeys: crea la cuenta con la invitación y envía un enlace de acceso. */
	enlace: async ({ params, request, getClientAddress, cookies, url }) => {
		const form = await request.formData();
		const name = acceptName.safeParse(form.get('name'));
		if (!name.success) return fail(400, { error: name.error.issues[0]?.message });
		let email: string;
		try {
			const res = await db.transaction((tx) =>
				acceptInvitation(
					{
						token: params.token,
						userId: randomUUID(),
						name: name.data,
						ip: getClientAddress(),
						userAgent: request.headers.get('user-agent')
					},
					tx
				)
			);
			email = res.email;
		} catch (e) {
			if (e instanceof InvitationError) return fail(400, { error: e.message });
			throw e;
		}
		await getAuth().api.signInMagicLink({
			body: { email, callbackURL: '/bienvenida', errorCallbackURL: '/acceso?error=enlace' },
			headers: request.headers
		});
		cookies.set('acceso_dominio', email.split('@')[1] ?? '', {
			path: '/acceso',
			maxAge: 600,
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:'
		});
		redirect(303, '/acceso/revisa-tu-correo');
	},

	/** Invitación caducada: avisa a quien invitó para que la reenvíe. */
	renovar: async ({ params, request, getClientAddress }) => {
		await requestNewInvitation(params.token, {
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent')
		});
		return { toast: 'Aviso enviado' };
	}
};
