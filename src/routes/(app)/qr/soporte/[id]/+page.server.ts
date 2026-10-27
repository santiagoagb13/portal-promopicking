import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { config } from '$lib/server/config';
import { qrSheet } from '$lib/server/services/qr';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const sheet = await qrSheet(locals.user!, params.id);
	if (!sheet) error(404, 'Soporte no encontrado');
	const codes = await Promise.all(
		sheet.codes.map(async (c) => ({
			...c,
			url: `${config.authOrigin}/qr/${c.code}`,
			svg: await QRCode.toString(`${config.authOrigin}/qr/${c.code}`, { type: 'svg', margin: 0 })
		}))
	);
	return { title: `QR · ${sheet.support.name}`, support: sheet.support, codes };
};
