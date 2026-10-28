import { error } from '@sveltejs/kit';
import { contentTypeOf, fileStorage, isSafeKey, storageProvider } from '$lib/server/storage';
import { verify } from '$lib/server/storage/signing';
import type { RequestHandler } from './$types';

/**
 * Ficheros del almacenamiento local, con URL firmada y caducidad (además de la sesión, que exige
 * hooks.server.ts). Con `STORAGE_PROVIDER=s3` las URL firmadas van directamente al proveedor.
 */
function check(params: { key: string }, url: URL, parts: string[]) {
	if (storageProvider() === 's3') error(404, 'No encontrado');
	if (!isSafeKey(params.key)) error(400, 'Clave no válida');
	const exp = Number(url.searchParams.get('exp'));
	if (!exp || exp < Date.now() / 1000) error(403, 'Enlace caducado');
	if (!verify(parts, url.searchParams.get('sig'))) error(403, 'Firma no válida');
}

export const GET: RequestHandler = async ({ params, url }) => {
	const name = url.searchParams.get('nombre') ?? '';
	check(params, url, ['GET', params.key, url.searchParams.get('exp') ?? '', name]);
	const body = await fileStorage().get(params.key);
	if (!body) error(404, 'No encontrado');
	const headers: Record<string, string> = {
		'content-type': contentTypeOf(params.key),
		'cache-control': 'private, max-age=600',
		'x-content-type-options': 'nosniff'
	};
	if (name)
		headers['content-disposition'] = `attachment; filename="${name.replace(/["\r\n]/g, '')}"`;
	return new Response(new Uint8Array(body), { headers });
};

/** Subida directa (la URL la genera `uploadUrl` y fija tamaño máximo y tipo). */
export const PUT: RequestHandler = async ({ params, url, request }) => {
	const size = url.searchParams.get('size') ?? '';
	const type = request.headers.get('content-type') ?? '';
	check(params, url, ['PUT', params.key, url.searchParams.get('exp') ?? '', size, type]);
	const body = new Uint8Array(await request.arrayBuffer());
	if (body.byteLength > Number(size)) error(413, 'Fichero mayor de lo anunciado');
	await fileStorage().put(params.key, body, type);
	return new Response(null, { status: 204 });
};
