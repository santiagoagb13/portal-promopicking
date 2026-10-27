import writeXlsxFile from 'write-excel-file/node';
import { EXPORT_HEADERS } from '$lib/domain/master';
import { audit } from '$lib/server/audit';
import { listRestaurants } from '$lib/server/services/master';
import type { RequestHandler } from './$types';

/** Descarga del maestro en Excel, con las mismas columnas que admite la importación. */
export const GET: RequestHandler = async ({ locals, url, request, getClientAddress }) => {
	const actor = locals.user!;
	const brand = url.searchParams.get('marca')?.toUpperCase() || undefined;
	const rows = await listRestaurants(actor, { brand });
	const sheet = [
		EXPORT_HEADERS.map(([, label]) => ({ value: label, fontWeight: 'bold' as const })),
		...rows.map((r) =>
			EXPORT_HEADERS.map(([k]) => ({ value: (r[k as keyof typeof r] as string | null) ?? '' }))
		)
	];
	const buffer = await writeXlsxFile(sheet, {
		columns: EXPORT_HEADERS.map(([k]) => ({ width: k === 'address' ? 44 : k === 'name' ? 28 : 14 }))
	}).toBuffer();
	await audit({
		userId: actor.id,
		action: 'master.exported',
		after: { brand: brand ?? null, rows: rows.length },
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent')
	});
	const name = `maestro-${brand?.toLowerCase() ?? 'todas'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
	return new Response(new Uint8Array(buffer), {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="${name}"`,
			'cache-control': 'private, no-store'
		}
	});
};
