import { error } from '@sveltejs/kit';
import { toCsv } from '$lib/domain/master';
import { config } from '$lib/server/config';
import { qrSheet } from '$lib/server/services/qr';
import type { RequestHandler } from './$types';

/** CSV para la imprenta: código, URL que va en el QR, versión, restaurante y lote. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const sheet = await qrSheet(locals.user!, params.id);
	if (!sheet) error(404, 'Soporte no encontrado');
	const csv = toCsv([
		['Código', 'URL', 'Versión', 'Restaurante', 'Código restaurante', 'Lote', 'Retirado'],
		...sheet.codes.map((c) => [
			c.code,
			`${config.authOrigin}/qr/${c.code}`,
			c.versionCode,
			c.restaurantName ?? '',
			c.restaurantId ?? '',
			c.batch,
			c.retiredAt ? 'sí' : ''
		])
	]);
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="qr-${params.id}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
