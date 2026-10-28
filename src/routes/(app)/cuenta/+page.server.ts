import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { z } from '$lib/schemas/z';
import { ROLE_LABEL } from '$lib/i18n/es';
import { audit, requestMeta } from '$lib/server/audit';
import { deviceLabel, getAuth } from '$lib/server/auth';
import { db, tables } from '$lib/server/db';
import { describeAccess } from '$lib/server/services/invitations';
import type { Actions, PageServerLoad } from './$types';

const { passkeys, sessions, users } = tables;

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:cuenta');
	const user = locals.user!;
	const [keys, active, access, [prefs]] = await Promise.all([
		db
			.select({
				id: passkeys.id,
				name: passkeys.name,
				createdAt: passkeys.createdAt,
				lastUsedAt: passkeys.lastUsedAt
			})
			.from(passkeys)
			.where(eq(passkeys.userId, user.id))
			.orderBy(asc(passkeys.createdAt)),
		db
			.select({
				id: sessions.id,
				userAgent: sessions.userAgent,
				ipAddress: sessions.ipAddress,
				createdAt: sessions.createdAt,
				updatedAt: sessions.updatedAt
			})
			.from(sessions)
			.where(eq(sessions.userId, user.id))
			.orderBy(desc(sessions.updatedAt)),
		describeAccess(user.role, {
			brands: user.brands,
			restaurants: user.restaurants.map((r) => r.id)
		}),
		db.select({ notifyEmail: users.notifyEmail }).from(users).where(eq(users.id, user.id))
	]);
	return {
		title: 'Cuenta',
		profile: { name: user.name, email: user.email, role: ROLE_LABEL[user.role], access },
		notifyEmail: prefs?.notifyEmail ?? true,
		passkeys: keys,
		sessions: active
			.filter((s) => s.updatedAt) // todas
			.map((s) => ({
				id: s.id,
				device: deviceLabel(s.userAgent),
				ip: s.ipAddress,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
				current: s.id === locals.session?.id
			}))
	};
};

const id = z.string().min(1).max(80);

export const actions: Actions = {
	avisos: async ({ request, locals }) => {
		const on = (await request.formData()).get('correo') === 'si';
		await db.update(users).set({ notifyEmail: on }).where(eq(users.id, locals.user!.id));
		await audit({
			userId: locals.user!.id,
			action: 'user.notify_email',
			entity: 'user',
			entityId: locals.user!.id,
			after: { notifyEmail: on },
			...requestMeta(request)
		});
		return {
			toast: on
				? 'Recibirás los avisos también por correo'
				: 'Los avisos solo llegarán a la campana'
		};
	},
	renombrar: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = z
			.object({ id, name: z.string().trim().min(1, 'Escribe un nombre').max(60) })
			.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0]?.message });
		await getAuth().api.updatePasskey({ headers: request.headers, body: parsed.data });
		await audit({
			userId: locals.user!.id,
			action: 'passkey.renamed',
			entity: 'passkey',
			entityId: parsed.data.id,
			after: { name: parsed.data.name },
			...requestMeta(request)
		});
		return { toast: 'Passkey renombrada' };
	},
	borrarPasskey: async ({ request, locals }) => {
		const parsed = id.safeParse((await request.formData()).get('id'));
		if (!parsed.success) return fail(400);
		const [own] = await db
			.select({ id: passkeys.id })
			.from(passkeys)
			.where(and(eq(passkeys.id, parsed.data), eq(passkeys.userId, locals.user!.id)));
		if (!own) return fail(404);
		// La auditoría la escribe el hook de Better Auth (passkey.deleted).
		await getAuth().api.deletePasskey({ headers: request.headers, body: { id: parsed.data } });
		return { toast: 'Passkey eliminada' };
	},
	cerrarSesion: async ({ request, locals, getClientAddress }) => {
		const parsed = id.safeParse((await request.formData()).get('id'));
		if (!parsed.success) return fail(400);
		if (parsed.data === locals.session?.id)
			return fail(400, { error: 'Para cerrar esta sesión usa «Salir»' });
		const deleted = await db
			.delete(sessions)
			.where(and(eq(sessions.id, parsed.data), eq(sessions.userId, locals.user!.id)))
			.returning({ id: sessions.id });
		if (!deleted.length) return fail(404);
		await audit({
			userId: locals.user!.id,
			action: 'auth.session_revoked',
			entity: 'session',
			entityId: parsed.data,
			...requestMeta(request, getClientAddress())
		});
		return { toast: 'Sesión cerrada' };
	},
	cerrarOtras: async ({ request, locals, getClientAddress }) => {
		const deleted = await db
			.delete(sessions)
			.where(and(eq(sessions.userId, locals.user!.id), ne(sessions.id, locals.session!.id)))
			.returning({ id: sessions.id });
		await audit({
			userId: locals.user!.id,
			action: 'auth.sessions_revoked',
			after: { count: deleted.length },
			...requestMeta(request, getClientAddress())
		});
		return {
			toast: deleted.length === 1 ? '1 sesión cerrada' : `${deleted.length} sesiones cerradas`
		};
	}
};
