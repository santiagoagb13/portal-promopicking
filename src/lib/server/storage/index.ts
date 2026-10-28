/**
 * Almacenamiento de ficheros (artes finales, páginas convertidas, actas). Dos adaptadores con la
 * misma interfaz: `local` (disco; desarrollo, pruebas o el VPS) y `s3` (cualquier servicio
 * compatible: AWS S3, Cloudflare R2, Hetzner, MinIO). Ver ADR 0007.
 *
 * Los ficheros nunca son públicos: se leen y se suben con URL firmadas que caducan.
 */
import { serverEnv } from '../config';
import { databaseStorage } from './database';
import { localStorage } from './local';
import { s3Storage } from './s3';

export type UrlOptions = { expiresIn?: number; filename?: string; contentType?: string };

export interface FileStorage {
	put(key: string, body: Uint8Array, contentType: string): Promise<void>;
	get(key: string): Promise<Uint8Array | null>;
	head(key: string): Promise<{ size: number } | null>;
	delete(key: string): Promise<void>;
	/** URL de lectura temporal (por defecto 10 min). */
	readUrl(key: string, opts?: UrlOptions): Promise<string>;
	/** URL de subida directa desde el navegador (PUT), para no pasar ficheros grandes por la función. */
	uploadUrl(
		key: string,
		opts: { contentType: string; size: number; expiresIn?: number }
	): Promise<string>;
}

let instance: FileStorage | undefined;

/** Proveedor de ficheros: el de STORAGE_PROVIDER; si falta, la base de datos en Vercel (sin disco) y disco fuera. */
export function storageProvider(): string {
	return serverEnv('STORAGE_PROVIDER') || (serverEnv('VERCEL') ? 'database' : 'local');
}

export function fileStorage(): FileStorage {
	if (instance) return instance;
	const provider = storageProvider();
	if (provider === 's3') instance = s3Storage();
	else if (provider === 'local') instance = localStorage();
	else if (provider === 'database') instance = databaseStorage();
	else throw new Error(`STORAGE_PROVIDER desconocido: ${provider} (local | s3 | database)`);
	return instance;
}

/** Para pruebas: vuelve a leer la configuración. */
export function resetStorage() {
	instance = undefined;
}

export const CONTENT_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	webp: 'image/webp',
	png: 'image/png',
	jpg: 'image/jpeg',
	csv: 'text/csv; charset=utf-8',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function contentTypeOf(key: string): string {
	return CONTENT_TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Claves seguras: segmentos alfanuméricos, sin `..` ni rutas absolutas. */
export function isSafeKey(key: string): boolean {
	return (
		/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._+-]*)*$/.test(key) && !key.includes('..')
	);
}
