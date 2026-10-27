import { fail } from '@sveltejs/kit';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, tables } from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

const { notifications } = tables;

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:notificaciones');
	const items = await db
		.select()
		.from(notifications)
		.where(eq(notifications.userId, locals.user!.id))
		.orderBy(desc(notifications.createdAt))
		.limit(50);
	return { title: 'Notificaciones', items };
};

const ids = z.array(z.string().max(80)).max(200);

export const actions: Actions = {
	/** Marca todas como leídas y devuelve cuáles para poder deshacerlo. */
	leer: async ({ locals }) => {
		const rows = await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(and(eq(notifications.userId, locals.user!.id), isNull(notifications.readAt)))
			.returning({ id: notifications.id });
		return { read: rows.map((r) => r.id) };
	},
	/** Deshacer: vuelven a no leídas (solo las del usuario). */
	noLeer: async ({ locals, request }) => {
		const parsed = ids.safeParse((await request.formData()).getAll('id'));
		if (!parsed.success) return fail(400);
		if (parsed.data.length)
			await db
				.update(notifications)
				.set({ readAt: null })
				.where(and(eq(notifications.userId, locals.user!.id), inArray(notifications.id, parsed.data)));
		return { restored: parsed.data.length };
	}
};
