import { count, eq } from 'drizzle-orm';
import { safeBack } from '$lib/safe-back';
import { db, tables } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** Tras entrar con enlace mágico (8.1): se propone registrar una passkey en este dispositivo. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const [row] = await db
		.select({ n: count() })
		.from(tables.passkeys)
		.where(eq(tables.passkeys.userId, locals.user!.id));
	return {
		title: 'Bienvenida',
		back: safeBack(url.searchParams.get('volver')),
		passkeys: row?.n ?? 0
	};
};
