/** Soporte e incidencias (8.11). */
import { sql } from 'drizzle-orm';
import { db, tables } from '../db';

const { tickets } = tables;

/** Siguiente id de ticket (`INC-2042`, `CON-2039`), bajo un cerrojo de transacción. */
export async function nextTicketId(tx: typeof db, prefix: 'INC' | 'CON'): Promise<string> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ticket-id'))`);
	const [row] = await tx
		.select({ max: sql<number | null>`max(substring(${tickets.id} from 5)::int)` })
		.from(tickets)
		.where(sql`${tickets.id} like ${prefix + '-%'}`);
	return `${prefix}-${(row?.max ?? 2000) + 1}`;
}
