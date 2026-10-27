import { AwsClient } from 'aws4fetch';
import { serverEnv } from '../config';
import type { FileStorage } from './index';

/**
 * Almacenamiento compatible con S3 (firma SigV4 con aws4fetch; URL de estilo ruta:
 * `<S3_ENDPOINT>/<S3_BUCKET>/<clave>`). Sirve para AWS S3, Cloudflare R2, Hetzner o MinIO.
 */
export function s3Storage(): FileStorage {
	const endpoint = (serverEnv('S3_ENDPOINT') ?? '').replace(/\/$/, '');
	const bucket = serverEnv('S3_BUCKET');
	const accessKeyId = serverEnv('S3_KEY');
	const secretAccessKey = serverEnv('S3_SECRET');
	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey)
		throw new Error('STORAGE_PROVIDER=s3 requiere S3_ENDPOINT, S3_BUCKET, S3_KEY y S3_SECRET');
	const client = new AwsClient({
		accessKeyId,
		secretAccessKey,
		service: 's3',
		region: serverEnv('S3_REGION') || 'auto'
	});
	const url = (key: string) =>
		`${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

	async function presign(
		method: 'GET' | 'PUT',
		key: string,
		expiresIn: number,
		query: Record<string, string> = {},
		headers: Record<string, string> = {}
	) {
		const u = new URL(url(key));
		u.searchParams.set('X-Amz-Expires', String(expiresIn));
		for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
		const signed = await client.sign(u.toString(), {
			method,
			headers,
			aws: { signQuery: true, allHeaders: Object.keys(headers).length > 0 }
		});
		return signed.url;
	}

	return {
		async put(key, body, contentType) {
			const res = await client.fetch(url(key), {
				method: 'PUT',
				body: Buffer.from(body),
				headers: { 'content-type': contentType }
			});
			if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${await res.text()}`);
		},
		async get(key) {
			const res = await client.fetch(url(key));
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`S3 GET ${res.status}`);
			return new Uint8Array(await res.arrayBuffer());
		},
		async head(key) {
			const res = await client.fetch(url(key), { method: 'HEAD' });
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`S3 HEAD ${res.status}`);
			return { size: Number(res.headers.get('content-length') ?? 0) };
		},
		async delete(key) {
			const res = await client.fetch(url(key), { method: 'DELETE' });
			if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${res.status}`);
		},
		async readUrl(key, opts = {}) {
			const query: Record<string, string> = {};
			if (opts.filename)
				query['response-content-disposition'] =
					`attachment; filename="${opts.filename.replace(/"/g, '')}"`;
			if (opts.contentType) query['response-content-type'] = opts.contentType;
			return presign('GET', key, opts.expiresIn ?? 600, query);
		},
		async uploadUrl(key, opts) {
			return presign('PUT', key, opts.expiresIn ?? 900, {}, { 'content-type': opts.contentType });
		}
	};
}
