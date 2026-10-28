/**
 * Migraciones al arrancar el contenedor (VPS). Igual que scripts/migrate.ts, pero en JS plano:
 * la imagen final no lleva tsx ni el código fuente, solo `build/` y las migraciones SQL.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const pool = new pg.Pool({ connectionString: url, max: 1 });
await migrate(drizzle(pool), { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
await pool.end();
console.info('Migraciones aplicadas');
