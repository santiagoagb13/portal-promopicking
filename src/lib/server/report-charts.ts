/** Gráficos del informe a partir de `reportData`: la página y el PDF piden lo mismo con otro tamaño. */
import { BRAND_SLOT, INCIDENT_SLOT, monthLabel } from '$lib/domain/reports';
import { donut, hbars, lineChart, stackedColumns } from './charts';
import type { ReportData } from './services/reports';

/** Motivos fuera de la lista fija se suman en «Otros» (la paleta tiene 5 huecos, 8.9). */
export function incidentKinds(data: ReportData) {
	const out = new Map<string, number>();
	for (const k of data.incidentsByKind) {
		const key = k.kind in INCIDENT_SLOT ? k.kind : 'Otros';
		out.set(key, (out.get(key) ?? 0) + k.n);
	}
	return Object.keys(INCIDENT_SLOT)
		.map((kind) => ({ kind, n: out.get(kind) ?? 0, slot: INCIDENT_SLOT[kind]! }))
		.filter((k) => k.n > 0);
}

export function reportCharts(
	data: ReportData,
	size: { wide: number; height: number; donut: number; bars: number }
) {
	const labels = data.months.map((m) => monthLabel(m));
	const otifValues = data.byMonth.map((r) =>
		r.otif === null ? null : Math.round(r.otif * 10) / 10
	);
	const known = otifValues.filter((v): v is number => v !== null);
	const min = Math.max(0, Math.floor(Math.min(data.otifTarget - 2, ...known) / 2) * 2);
	const kinds = incidentKinds(data);
	return {
		otif: lineChart(labels, otifValues, {
			width: size.wide,
			height: size.height,
			min,
			max: 100,
			target: data.otifTarget,
			unit: ' %'
		}),
		consumo: stackedColumns(
			labels,
			data.byBrand.map((b) => ({
				key: b.code,
				slot: BRAND_SLOT[b.code] ?? 5,
				name: b.name,
				values: b.pieces
			})),
			{ width: size.wide, height: size.height }
		),
		incidencias: donut(
			kinds.map((k) => ({ key: k.kind, slot: k.slot, value: k.n })),
			{ size: size.donut }
		),
		aprobacion: hbars(
			data.byBrand.map((b) => ({ key: b.code, label: b.name, value: b.approvalAvg })),
			{ width: size.bars, max: Math.max(5, ...data.byBrand.map((b) => b.approvalAvg ?? 0)) }
		),
		kinds
	};
}

export type ReportCharts = ReturnType<typeof reportCharts>;
