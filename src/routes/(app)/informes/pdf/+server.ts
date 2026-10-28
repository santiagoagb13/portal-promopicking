import { error } from '@sveltejs/kit';
import { todayDay } from '$lib/domain/dates';
import { reportPdf } from '$lib/server/report-pdf';
import { ReportError, reportData } from '$lib/server/services/reports';
import { reportParams } from '../params';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const params = reportParams(url);
	try {
		const data = await reportData(locals.user!, { ...params, today: todayDay() });
		const now = new Date();
		const local = new Intl.DateTimeFormat('sv-SE', {
			timeZone: 'Europe/Madrid',
			dateStyle: 'short',
			timeStyle: 'short'
		}).format(now);
		const bytes = await reportPdf(data, {
			generatedAt: local.replace(' ', 'T'),
			generatedBy: locals.user!.name ?? 'Usuario',
			brandName: data.brands.find((b) => b.code === data.brand)?.name ?? 'Todas las marcas'
		});
		const name = `informe-${(data.brand ?? 'todas').toLowerCase()}-${data.period}-${data.months.at(-1)}.pdf`;
		return new Response(bytes as BodyInit, {
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${name}"`,
				'cache-control': 'private, no-store'
			}
		});
	} catch (e) {
		if (e instanceof ReportError) error(404, e.message);
		throw e;
	}
};
