/** Informes (8.9): periodos, meses, días laborables y formato, compartidos por la página y el PDF. */

export const PERIODS = ['12m', 'trimestre', 'anio'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = {
	'12m': 'Últimos 12 meses',
	trimestre: 'Último trimestre',
	anio: 'Este año'
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

/** `2026-10` → `oct` (eje) o `octubre de 2026` (títulos). */
export function monthLabel(month: string, long = false): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return long ? `${MONTHS_LONG[m - 1]} de ${y}` : MONTHS[m - 1]!;
}

function shift(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	const d = new Date(Date.UTC(y, m - 1 + n, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Meses del periodo, del más antiguo al actual (incluido). */
export function monthsFor(period: Period, today: string): string[] {
	const current = today.slice(0, 7);
	const n = period === '12m' ? 12 : period === 'trimestre' ? 3 : Number(current.slice(5, 7));
	return Array.from({ length: n }, (_, i) => shift(current, i - n + 1));
}

/** Último día del mes (`2026-02` → `2026-02-28`). */
export function monthEnd(month: string): string {
	const next = shift(month, 1);
	const d = new Date(`${next}-01T00:00:00Z`);
	d.setUTCDate(0);
	return d.toISOString().slice(0, 10);
}

/**
 * Días laborables transcurridos entre dos instantes (lunes a viernes), con fracción: una
 * aprobación el mismo día cuenta las horas que pasaron. Festivos no: el plan no los fija.
 */
export function businessDays(from: Date, to: Date): number {
	if (to <= from) return 0;
	let ms = 0;
	let t = from.getTime();
	const end = to.getTime();
	while (t < end) {
		const d = new Date(t);
		const nextDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
		const stop = Math.min(nextDay, end);
		const wd = d.getUTCDay();
		if (wd !== 0 && wd !== 6) ms += stop - t;
		t = stop;
	}
	return ms / 86_400_000;
}

export const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : null);

/** 97,4 % · 1,1 % · — */
export function fmtPct(v: number | null, digits = 1): string {
	return v === null
		? '—'
		: `${v.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

export function fmtInt(v: number): string {
	return v.toLocaleString('es-ES', { maximumFractionDigits: 0 });
}

/** 1,23 M · 456,7 mil · 980 */
export function fmtCompact(v: number): string {
	if (v >= 1_000_000)
		return `${(v / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M`;
	if (v >= 10_000) return `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil`;
	return fmtInt(v);
}

export function fmtDays(v: number | null): string {
	return v === null
		? '—'
		: `${v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} días`;
}

/**
 * Orden fijo de la paleta categórica (validada en claro y oscuro): las marcas usan siempre los
 * tres primeros huecos en este orden, y un filtro no repinta las que quedan (8.9).
 */
export const BRAND_SLOT: Record<string, number> = { FH: 1, VIPS: 2, GINOS: 3 };
/** Motivos de incidencia en el orden de la paleta; los que no estén van a «Otros». */
export const INCIDENT_SLOT: Record<string, number> = {
	'Faltan unidades': 1,
	'Bulto dañado': 2,
	'Retraso de transporte': 3,
	'Versión incorrecta': 4,
	Otros: 5
};
/** Colores de la paleta en claro, para el PDF (en pantalla salen de los tokens `--series-n`). */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

type Kpis = {
	otif: number | null;
	incidentRate: number | null;
	incidents: number;
	parcels: number;
	pieces: number;
	orders: number;
	orderCents: number;
	approvalAvg: number | null;
};

/** Las cinco cifras de cabecera con su texto: la página y el PDF las escriben igual. */
export function kpiCards(k: Kpis, otifTarget: number, period: Period) {
	const euros = (k.orderCents / 100).toLocaleString('es-ES', {
		style: 'currency',
		currency: 'EUR'
	});
	return [
		{
			key: 'otif',
			label: 'OTIF (entregas completas y a tiempo)',
			value: fmtPct(k.otif),
			sub: `objetivo ${fmtPct(otifTarget, 0)}`
		},
		{
			key: 'incidencias',
			label: 'Incidencias',
			value: fmtPct(k.incidentRate),
			sub: `${fmtInt(k.incidents)} de ${fmtInt(k.parcels)} bultos`
		},
		{
			key: 'piezas',
			label: 'Piezas entregadas',
			value: fmtCompact(k.pieces),
			sub: PERIOD_LABEL[period].toLowerCase()
		},
		{
			key: 'reposiciones',
			label: 'Reposiciones',
			value: `${fmtInt(k.orders)} pedidos`,
			sub: euros
		},
		{
			key: 'aprobacion',
			label: 'Tiempo medio de aprobación',
			value: fmtDays(k.approvalAvg),
			sub: 'laborables · objetivo ≤ 5'
		}
	];
}
