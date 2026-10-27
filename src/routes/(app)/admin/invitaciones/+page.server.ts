import { fail } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { ROLE_LABEL } from '$lib/i18n/es';
import { can, ROLES, type Role } from '$lib/permissions';
import { invitationInput } from '$lib/schemas/invitation';
import { db, tables } from '$lib/server/db';
import {
	createInvitation,
	InvitationError,
	listOpenInvitations,
	resendInvitation,
	revokeInvitation
} from '$lib/server/services/invitations';
import type { Actions, PageServerLoad } from './$types';

const { brands, restaurants, invitations } = tables;

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:invitaciones');
	const actor = locals.user!;
	const roles: Role[] = ROLES.filter((r) => can(actor, 'user.invite', r === 'manager' ? undefined : { targetRole: r }));
	const [list, brandRows, restaurantRows] = await Promise.all([
		listOpenInvitations(actor),
		db.select({ code: brands.code, name: brands.name }).from(brands).orderBy(asc(brands.code)),
		db
			.select({ id: restaurants.id, name: restaurants.name, brandCode: restaurants.brandCode })
			.from(restaurants)
			.where(actor.role === 'brand' ? inArray(restaurants.brandCode, actor.brands) : undefined)
			.orderBy(asc(restaurants.brandCode), asc(restaurants.name))
	]);
	return {
		title: 'Invitaciones',
		invitations: list.map((i) => ({
			id: i.id,
			email: i.email,
			name: i.name,
			access: i.access,
			inviterName: i.inviterName,
			sentAt: i.sentAt,
			expiresAt: i.expiresAt,
			state: i.state
		})),
		roles: roles.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
		brands: actor.role === 'admin' ? brandRows : [],
		restaurants: restaurantRows
	};
};

function meta(request: Request, ip: string) {
	return { ip, userAgent: request.headers.get('user-agent') };
}

export const actions: Actions = {
	crear: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const raw = {
			email: form.get('email'),
			name: form.get('name') ?? '',
			role: form.get('role'),
			brands: form.getAll('brands'),
			restaurants: form.getAll('restaurants')
		};
		const parsed = invitationInput.safeParse(raw);
		const values = { email: String(raw.email ?? ''), name: String(raw.name), role: String(raw.role ?? '') };
		if (!parsed.success) return fail(400, { create: { error: parsed.error.issues[0]?.message, values } });
		// Solo cuenta el ámbito que corresponde al rol elegido.
		const input = {
			...parsed.data,
			brands: parsed.data.role === 'brand' ? parsed.data.brands : [],
			restaurants: parsed.data.role === 'manager' ? parsed.data.restaurants : []
		};
		try {
			await createInvitation(locals.user!, input, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof InvitationError) return fail(400, { create: { error: e.message, values } });
			throw e;
		}
		return { toast: 'Invitación enviada' };
	},
	reenviar: async ({ request, locals, getClientAddress }) => {
		const id = z.string().uuid().safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400);
		try {
			await resendInvitation(locals.user!, id.data, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof InvitationError) return fail(400, { error: e.message });
			throw e;
		}
		return { toast: 'Invitación reenviada' };
	},
	revocar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = z.string().uuid().safeParse(form.get('id'));
		if (!id.success) return fail(400);
		// «Escribe el nombre»: se comprueba también en el servidor.
		const [inv] = await db
			.select({ email: invitations.email })
			.from(invitations)
			.where(inArray(invitations.id, [id.data]));
		if (!inv || String(form.get('confirmacion') ?? '').trim().toLowerCase() !== inv.email)
			return fail(400, { error: 'Escribe el correo exacto para revocar' });
		try {
			await revokeInvitation(locals.user!, id.data, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof InvitationError) return fail(400, { error: e.message });
			throw e;
		}
		return { toast: 'Invitación revocada' };
	}
};
