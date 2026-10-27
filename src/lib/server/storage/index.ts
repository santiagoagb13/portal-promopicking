/**
 * Almacenamiento de ficheros (artes finales, fotos, etiquetas). Interfaz fijada desde la fase 1;
 * los adaptadores (Vercel Blob ahora, S3 compatible en el VPS) llegan con la subida de artes (fase 3).
 */
export interface FileStorage {
	put(key: string, body: Uint8Array, contentType: string): Promise<void>;
	get(key: string): Promise<Uint8Array | null>;
	delete(key: string): Promise<void>;
	/** URL firmada de lectura con caducidad. */
	signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export function fileStorage(): FileStorage {
	throw new Error('Almacenamiento no configurado todavía (STORAGE_PROVIDER, fase 3)');
}
