import { error } from '@sveltejs/kit';
import { todayDay } from '$lib/domain/dates';
import { toCsv } from '$lib/domain/master';
import { incidentKinds } from '$lib/server/report-charts';
import { ReportError, reportData, type ReportData } from '$lib/server/services/reports';
import { reportParams } from '../../params';
import type { RequestHandler } from './$types';

type Cell = string | number | null;
/** Decimales con coma, como los abre Excel en español. */
const dec = (v: number | null, d = 1) => (v === null ? '' : v.toFixed(d).replace('.', ','));
const eur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

const TABLES: Record<string, (r: ReportData) => Cell[][]> = {
	otif: (r) => [
		[
			'Mes',
			'Bultos',
			'A tiempo y completos',
			'OTIF %',
			'Incidencias',
			'Piezas',
			'Pedidos',
			'Importe pedidos €'
		],
		...r.byMonth.map((m) => [
			m.month,
			m.parcels,
			m.parcelsOk,
			dec(m.otif),
			m.incidents,
			m.pieces,
			m.orders,
			eur(m.orderCents)
		])
	],
	consumo: (r) => [
		['Mes', ...r.byBrand.map((b) => b.name)],
		...r.months.map((m, i) => [m, ...r.byBrand.map((b) => b.pieces[i] ?? 0)])
	],
	incidencias: (r) => [['Tipo', 'Incidencias'], ...incidentKinds(r).map((k) => [k.kind, k.n])],
	aprobacion: (r) => [
		['Marca', 'Aprobaciones', 'Días laborables de media'],
		...r.byBrand.map((b) => [b.name, b.approvals, dec(b.approvalAvg)])
	],
	reposiciones: (r) => [
		['Restaurante', 'Código', 'Pedidos', 'Importe €'],
		...r.topRestaurants.map((t) => [t.name, t.id, t.orders, eur(t.cents)])
	],
	soportes: (r) => [
		['Soporte', 'Marca', 'Piezas'],
		...r.topSupports.map((s) => [s.name, s.brandCode, s.pieces])
	]
};

export const GET: RequestHandler = async ({ locals, url, params }) => {
	const build = TABLES[params.tabla];
	if (!build) error(404, 'Tabla no encontrada');
	try {
		const data = await reportData(locals.user!, { ...reportParams(url), today: todayDay() });
		const name = `informe-${params.tabla}-${(data.brand ?? 'todas').toLowerCase()}-${data.period}-${data.months.at(-1)}.csv`;
		return new Response(toCsv(build(data)), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${name}"`,
				'cache-control': 'private, no-store'
			}
		});
	} catch (e) {
		if (e instanceof ReportError) error(404, e.message);
		throw e;
	}
};
