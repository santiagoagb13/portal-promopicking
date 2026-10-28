import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Comprobación de salud (Docker, Caddy, monitorización): el proceso responde y llega a Postgres. */
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return new Response('ok', { headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('sin base de datos', {
			status: 503,
			headers: { 'cache-control': 'no-store' }
		});
	}
};
