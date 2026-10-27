/** Aplica las migraciones pendientes de `src/lib/server/db/migrations`. */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/lib/server/db/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');
const { db, pool } = createDb(url, 1);
await migrate(db, { migrationsFolder: 'src/lib/server/db/migrations' });
await pool.end();
console.info('Migraciones aplicadas');
