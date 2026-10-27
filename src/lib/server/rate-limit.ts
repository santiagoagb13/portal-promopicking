import { sql } from 'drizzle-orm';
import { db } from './db';

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: Date };

/**
 * Límite de intentos por ventana fija, guardado en Postgres para que valga igual con varias
 * instancias (funciones de Vercel) que con un único proceso en el VPS.
 */
export async function hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
	const res = await db.execute<{ count: number; reset_at: Date }>(sql`
		insert into rate_limits (key, count, reset_at)
		values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
		on conflict (key) do update set
			count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
			reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
		returning count, reset_at`);
	const row = res.rows[0]!;
	return { ok: row.count <= max, remaining: Math.max(0, max - row.count), resetAt: new Date(row.reset_at) };
}

/** Borra contadores caducados (se llama de vez en cuando; no hace falta un cron). */
export async function sweep(): Promise<void> {
	await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`);
}

/** Espera hasta que hayan pasado `ms` desde `start`, para que la respuesta tarde lo mismo exista o no el correo. */
export async function padTo(start: number, ms: number): Promise<void> {
	const left = start + ms - Date.now();
	if (left > 0) await new Promise((r) => setTimeout(r, left));
}
