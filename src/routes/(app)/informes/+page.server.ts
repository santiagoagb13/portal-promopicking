import { error } from '@sveltejs/kit';
import { todayDay } from '$lib/domain/dates';
import { reportCharts } from '$lib/server/report-charts';
import { ReportError, reportData } from '$lib/server/services/reports';
import { reportParams } from './params';
import type { PageServerLoad } from './$types';

// Sin JS en el cliente (9.3): gráficos SVG del servidor, filtros y exportaciones son enlaces.
export const csr = false;

export const load: PageServerLoad = async ({ locals, url }) => {
	const params = reportParams(url);
	try {
		const data = await reportData(locals.user!, { ...params, today: todayDay() });
		return {
			title: 'Informes',
			report: data,
			charts: reportCharts(data, { wide: 560, height: 220, donut: 140, bars: 260 })
		};
	} catch (e) {
		if (e instanceof ReportError) error(404, e.message);
		throw e;
	}
};
