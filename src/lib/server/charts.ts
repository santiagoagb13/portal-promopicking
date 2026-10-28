/**
 * Geometría de los gráficos de Informes (8.9), calculada en el servidor con d3-scale y d3-shape.
 * La página pinta el SVG con estos números (sin JS en el cliente) y el PDF reutiliza los mismos
 * trazos con pdf-lib, así que pantalla y PDF dibujan exactamente lo mismo.
 *
 * Marcas según la guía de visualización: líneas de 2 px, columnas de 24 px como mucho con el
 * extremo de datos redondeado (4 px) y recto en la base, 2 px de hueco entre segmentos, rejilla
 * de 1 px y una sola escala vertical.
 */
import { scaleBand, scaleLinear } from 'd3-scale';
import { arc, line, pie } from 'd3-shape';

export type Tick = { pos: number; label: string };
export type Frame = {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
};

const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

/** Línea de un solo valor por mes (OTIF) con su objetivo. */
export function lineChart(
	labels: string[],
	values: (number | null)[],
	o: { width: number; height: number; min: number; max: number; target?: number; unit?: string }
) {
	const f: Frame = { width: o.width, height: o.height, left: 36, right: 12, top: 12, bottom: 24 };
	const x = scaleBand<number>()
		.domain(labels.map((_, i) => i))
		.range([f.left, o.width - f.right])
		.padding(0.5);
	const y = scaleLinear()
		.domain([o.min, o.max])
		.range([o.height - f.bottom, f.top])
		.clamp(true);
	const cx = (i: number) => (x(i) ?? 0) + x.bandwidth() / 2;
	const path =
		line<number | null>()
			.defined((v) => v !== null)
			.x((_, i) => cx(i))
			.y((v) => y(v ?? 0))(values) ?? '';
	return {
		frame: f,
		path,
		dots: values.flatMap((v, i) =>
			v === null
				? []
				: [{ x: cx(i), y: y(v), value: v, label: labels[i]!, text: `${fmt(v)}${o.unit ?? ''}` }]
		),
		target:
			o.target === undefined
				? null
				: { y: y(o.target), label: `Objetivo ${fmt(o.target)}${o.unit ?? ''}` },
		yTicks: y.ticks(5).map((v) => ({ pos: y(v), label: fmt(v) })),
		xTicks: labels.map((l, i) => ({ pos: cx(i), label: l }))
	};
}

/** Trazo de una columna con el extremo de datos redondeado y la base recta. */
function columnPath(x: number, y: number, w: number, h: number, r: number) {
	const rr = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Columnas apiladas por mes (consumo por marca). */
export function stackedColumns(
	labels: string[],
	series: { key: string; slot: number; name: string; values: number[] }[],
	o: { width: number; height: number; unit?: string }
) {
	const f: Frame = { width: o.width, height: o.height, left: 44, right: 12, top: 12, bottom: 24 };
	const totals = labels.map((_, i) => series.reduce((n, s) => n + (s.values[i] ?? 0), 0));
	const x = scaleBand<number>()
		.domain(labels.map((_, i) => i))
		.range([f.left, o.width - f.right])
		.padding(0.3);
	const y = scaleLinear()
		.domain([0, Math.max(1, ...totals)])
		.nice()
		.range([o.height - f.bottom, f.top]);
	const w = Math.min(24, x.bandwidth());
	const GAP = 2;
	const columns = labels.map((label, i) => {
		const x0 = (x(i) ?? 0) + (x.bandwidth() - w) / 2;
		let base = y(0);
		const segs = series
			.filter((s) => (s.values[i] ?? 0) > 0)
			.map((s, k, arr) => {
				const v = s.values[i]!;
				const h = Math.max(0, y(0) - y(v) - (k > 0 ? GAP : 0));
				const top = base - h - (k > 0 ? GAP : 0);
				const last = k === arr.length - 1;
				const seg = {
					key: s.key,
					slot: s.slot,
					name: s.name,
					value: v,
					d: last ? columnPath(x0, top, w, h, 4) : `M${x0},${top}h${w}v${h}h${-w}Z`
				};
				base = top;
				return seg;
			});
		return { label, total: totals[i]!, x: x0 + w / 2, segs };
	});
	return {
		frame: f,
		columns,
		yTicks: y.ticks(4).map((v) => ({ pos: y(v), label: compact(v) })),
		xTicks: columns.map((c) => ({ pos: c.x, label: c.label }))
	};
}

function compact(v: number) {
	if (v >= 1_000_000) return `${fmt(v / 1_000_000)} M`;
	if (v >= 1000) return `${fmt(v / 1000)} mil`;
	return fmt(v);
}

/** Anillo de parte sobre el todo (incidencias por tipo, ≤ 6 segmentos y siempre con tabla). */
export function donut(items: { key: string; slot: number; value: number }[], o: { size: number }) {
	const r = o.size / 2;
	const total = items.reduce((n, i) => n + i.value, 0);
	const arcs = pie<{ key: string; slot: number; value: number }>()
		.value((d) => d.value)
		.sort(null)
		.padAngle(items.length > 1 ? 2 / r : 0)(items.filter((i) => i.value > 0));
	const shape = arc<(typeof arcs)[number]>()
		.innerRadius(r * 0.62)
		.outerRadius(r - 1);
	return {
		size: o.size,
		total,
		arcs: arcs.map((a) => ({
			key: a.data.key,
			slot: a.data.slot,
			value: a.data.value,
			share: total ? a.data.value / total : 0,
			d: shape(a) ?? ''
		}))
	};
}

/** Barras horizontales (tiempo medio de aprobación por marca): el valor va en la punta. */
export function hbars(
	items: { key: string; label: string; value: number | null }[],
	o: { width: number; max?: number; row?: number }
) {
	const row = o.row ?? 28;
	const max = o.max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
	const x = scaleLinear().domain([0, max]).range([0, o.width]);
	return {
		height: items.length * row,
		bars: items.map((i, k) => {
			const w = i.value ? Math.max(2, x(i.value)) : 0;
			const h = 12;
			const y0 = k * row + (row - h) / 2;
			return { ...i, y: y0, h, w, d: w ? columnPathH(0, y0, w, h, 4) : '' };
		})
	};
}

function columnPathH(x: number, y: number, w: number, h: number, r: number) {
	const rr = Math.min(r, h / 2, w);
	return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}
