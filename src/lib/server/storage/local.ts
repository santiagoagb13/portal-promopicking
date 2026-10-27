import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { serverEnv } from '../config';
import type { FileStorage } from './index';
import { sign } from './signing';

function root() {
	return resolve(serverEnv('STORAGE_LOCAL_DIR') || '.storage');
}

function pathOf(key: string) {
	const p = resolve(join(root(), key));
	if (!p.startsWith(root() + '/')) throw new Error('Clave fuera del almacenamiento');
	return p;
}

/**
 * Disco local. Las URL apuntan a la propia aplicación (`/archivos/<clave>`) con firma y caducidad;
 * el endpoint comprueba además que haya sesión.
 */
export function localStorage(): FileStorage {
	return {
		async put(key, body) {
			const p = pathOf(key);
			await mkdir(dirname(p), { recursive: true });
			await writeFile(p, body);
		},
		async get(key) {
			try {
				return new Uint8Array(await readFile(pathOf(key)));
			} catch {
				return null;
			}
		},
		async head(key) {
			try {
				return { size: (await stat(pathOf(key))).size };
			} catch {
				return null;
			}
		},
		async delete(key) {
			await rm(pathOf(key), { force: true });
		},
		async readUrl(key, opts = {}) {
			const exp = String(Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 600));
			const name = opts.filename ?? '';
			const q = new URLSearchParams({ exp, ...(name ? { nombre: name } : {}) });
			q.set('sig', sign(['GET', key, exp, name]));
			return `/archivos/${key}?${q}`;
		},
		async uploadUrl(key, opts) {
			const exp = String(Math.floor(Date.now() / 1000) + (opts.expiresIn ?? 900));
			const size = String(opts.size);
			const q = new URLSearchParams({ exp, size });
			q.set('sig', sign(['PUT', key, exp, size, opts.contentType]));
			return `/archivos/${key}?${q}`;
		}
	};
}
