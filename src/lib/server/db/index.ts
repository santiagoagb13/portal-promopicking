import { env } from '$env/dynamic/private';
import { createDb, currentTx, type Db, type DbOrTx } from './client';

let instance: ReturnType<typeof createDb> | undefined;

function getDb(): Db {
	if (!instance) {
		if (!env.DATABASE_URL) throw new Error('Falta la variable de entorno DATABASE_URL');
		instance = createDb(env.DATABASE_URL, Number(env.DATABASE_POOL_MAX ?? 10));
	}
	return instance.db;
}

/** Cierra el pool (scripts y pruebas). */
export async function closeDb(): Promise<void> {
	await instance?.pool.end();
	instance = undefined;
}

/** Cliente perezoso: no abre conexiones al importar (la compilación analiza los módulos). */
export const db = new Proxy({} as Db, {
	get(_target, prop) {
		const real = getDb();
		const value = Reflect.get(real, prop, real);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

/** La transacción en curso (p. ej. la de Better Auth al registrar una passkey) o el cliente normal. */
export function currentDb(): DbOrTx {
	return currentTx() ?? getDb();
}

export * as tables from './schema';
