import { fail } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import { ROLE_LABEL } from '$lib/i18n/es';
import { can, ROLES } from '$lib/permissions';
import { z } from '$lib/schemas/z';
import { db, tables } from '$lib/server/db';
import {
	deleteUser,
	listUsers,
	setSuspended,
	updateAccess,
	UserAdminError
} from '$lib/server/services/users';
import type { Actions, PageServerLoad } from './$types';

const { brands, restaurants, users } = tables;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:usuarios');
	const actor = locals.user!;
	const [list, brandRows, restaurantRows] = await Promise.all([
		listUsers(actor),
		db.select({ code: brands.code, name: brands.name }).from(brands).orderBy(asc(brands.code)),
		db
			.select({ id: restaurants.id, name: restaurants.name, brandCode: restaurants.brandCode })
			.from(restaurants)
			.where(actor.role === 'brand' ? inArray(restaurants.brandCode, actor.brands) : undefined)
			.orderBy(asc(restaurants.brandCode), asc(restaurants.name))
	]);
	return {
		title: 'Usuarios',
		users: list,
		roles: ROLES.filter((r) => actor.role === 'admin' || r === 'manager').map((r) => ({
			value: r,
			label: ROLE_LABEL[r]
		})),
		brands: actor.role === 'admin' ? brandRows : [],
		restaurants: restaurantRows,
		editing: url.searchParams.get('editar'),
		canManageAll: can(actor, 'audit.view')
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});
const userId = z.string().min(1).max(80);

async function guard<T>(key: string, fn: () => Promise<T>, toast: string) {
	try {
		await fn();
		return { toast };
	} catch (e) {
		if (e instanceof UserAdminError) return fail(400, { [key]: { error: e.message } });
		throw e;
	}
}

export const actions: Actions = {
	acceso: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({
				id: userId,
				role: z.enum(ROLES),
				brands: z.array(z.string()),
				restaurants: z.array(z.string())
			})
			.safeParse({
				id: form.get('id'),
				role: form.get('role'),
				brands: form.getAll('brands'),
				restaurants: form.getAll('restaurants')
			});
		if (!parsed.success)
			return fail(400, {
				access: { id: String(form.get('id')), error: 'Revisa el rol y el ámbito' }
			});
		const { id, ...input } = parsed.data;
		try {
			await updateAccess(locals.user!, id, input, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof UserAdminError) return fail(400, { access: { id, error: e.message } });
			throw e;
		}
		return { toast: 'Acceso actualizado' };
	},
	suspender: async ({ request, locals, getClientAddress }) => {
		const id = userId.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400);
		return guard(
			'user',
			() => setSuspended(locals.user!, id.data, true, meta(request, getClientAddress())),
			'Cuenta suspendida'
		);
	},
	reactivar: async ({ request, locals, getClientAddress }) => {
		const id = userId.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400);
		return guard(
			'user',
			() => setSuspended(locals.user!, id.data, false, meta(request, getClientAddress())),
			'Cuenta reactivada'
		);
	},
	eliminar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = userId.safeParse(form.get('id'));
		if (!id.success) return fail(400);
		// «Escribe el nombre», comprobado también aquí.
		const [u] = await db
			.select({ name: users.name })
			.from(users)
			.where(inArray(users.id, [id.data]));
		if (!u || String(form.get('confirmacion') ?? '').trim() !== u.name)
			return fail(400, { user: { error: 'Escribe el nombre exacto' } });
		return guard(
			'user',
			() => deleteUser(locals.user!, id.data, meta(request, getClientAddress())),
			'Cuenta eliminada'
		);
	}
};
