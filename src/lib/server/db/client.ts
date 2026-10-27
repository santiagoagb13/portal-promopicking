import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

const txStorage = new AsyncLocalStorage<Tx>();

/**
 * Crea el cliente de Drizzle sobre un pool de `pg`. Sirve igual para Neon (cadena con pooler, TCP)
 * que para el Postgres del VPS. `transaction()` deja la transacción en curso disponible para
 * `currentDb()`, de modo que el código que corre dentro de una transacción de Better Auth
 * (aceptar una invitación al registrar la passkey) escribe en esa misma transacción.
 */
export function createDb(url: string, max = 10): { db: Db; pool: pg.Pool } {
	const pool = new pg.Pool({ connectionString: url, max });
	const real = drizzle(pool, { schema });
	const db = new Proxy(real, {
		get(target, prop, receiver) {
			if (prop === 'transaction') {
				return (cb: (tx: Tx) => Promise<unknown>, config?: unknown) =>
					target.transaction(
						(tx) => txStorage.run(tx, () => cb(tx)),
						config as Parameters<Db['transaction']>[1]
					);
			}
			return Reflect.get(target, prop, receiver);
		}
	});
	return { db, pool };
}

/** La transacción abierta en este contexto asíncrono, si la hay. */
export function currentTx(): Tx | undefined {
	return txStorage.getStore();
}
