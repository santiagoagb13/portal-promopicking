import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { labelUrl } from '$lib/domain/kits';
import { config } from '$lib/server/config';
import { getKit } from '$lib/server/services/kits';
import type { PageServerLoad } from './$types';

/** Etiquetas de bulto A6 (8.6): una por bulto, con QR (SVG generado en el servidor) y contenido. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const ids = [...new Set(url.searchParams.getAll('kit'))].slice(0, 300);
	if (!ids.length) error(400, 'Elige al menos un kit');
	const labels = [];
	for (const id of ids) {
		const kit = await getKit(locals.user!, id);
		if (!kit) continue;
		for (let n = 1; n <= kit.parcels; n++) {
			const svg = await QRCode.toString(labelUrl(config.authOrigin, kit.id, n), {
				type: 'svg',
				margin: 0,
				errorCorrectionLevel: 'M'
			});
			labels.push({ key: `${kit.id}-${n}`, n, kit, svg });
		}
	}
	if (!labels.length) error(404, 'Kits no encontrados');
	return { title: 'Etiquetas', labels };
};
