import { eq } from 'drizzle-orm';
import { db, tables } from '../db';
import type { FileStorage } from './index';
import { appUrls } from './local';

const { storedFiles } = tables;

/**
 * Ficheros en Postgres (`STORAGE_PROVIDER=database`), para el modo de pruebas en Vercel sin S3.
 * Las URL son las mismas que en disco: `/archivos/<clave>` firmadas y con sesión. Vercel limita
 * el cuerpo de cada petición a 4,5 MB, así que no sirve para PDF grandes (ADR 0012).
 */
export function databaseStorage(): FileStorage {
	return {
		async put(key, body, contentType) {
			const row = { key, contentType, size: body.byteLength, body: Buffer.from(body) };
			await db
				.insert(storedFiles)
				.values(row)
				.onConflictDoUpdate({ target: storedFiles.key, set: row });
		},
		async get(key) {
			const [r] = await db
				.select({ body: storedFiles.body })
				.from(storedFiles)
				.where(eq(storedFiles.key, key));
			return r ? new Uint8Array(r.body) : null;
		},
		async head(key) {
			const [r] = await db
				.select({ size: storedFiles.size })
				.from(storedFiles)
				.where(eq(storedFiles.key, key));
			return r ? { size: r.size } : null;
		},
		async delete(key) {
			await db.delete(storedFiles).where(eq(storedFiles.key, key));
		},
		...appUrls()
	};
}
