/**
 * Informe en PDF (8.9), generado en el servidor con pdf-lib. Usa los mismos datos (`reportData`),
 * los mismos textos de cabecera (`kpiCards`) y los mismos trazos de los gráficos (`reportCharts`)
 * que la página, de modo que lo exportado coincide con lo que se ve (criterio de la fase 6).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { money } from '$lib/domain/orders';
import {
	fmtCompact,
	fmtDays,
	fmtInt,
	fmtPct,
	kpiCards,
	monthLabel,
	PERIOD_LABEL,
	SERIES_LIGHT
} from '$lib/domain/reports';
import { safe } from './pdf';
import { reportCharts } from './report-charts';
import type { ReportData } from './services/reports';

const [W, H, M] = [595.28, 841.89, 40];
const INK = rgb(0.067, 0.067, 0.067);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.9, 0.9, 0.9);

function hex(h: string): RGB {
	const n = parseInt(h.slice(1), 16);
	return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const series = (slot: number) => hex(SERIES_LIGHT[slot - 1] ?? '#9aa5b1');

type Col = { label: string; width: number; align?: 'right' };

export async function reportPdf(
	data: ReportData,
	meta: { generatedAt: string; generatedBy: string; brandName: string }
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const title = `Informe de servicio · ${meta.brandName} · ${PERIOD_LABEL[data.period]}`;
	doc.setTitle(safe(title));
	doc.setAuthor('Portal de servicio Promopicking');
	doc.setCreationDate(new Date(meta.generatedAt));
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const charts = reportCharts(data, { wide: W - 2 * M, height: 170, donut: 120, bars: 220 });

	let page: PDFPage = doc.addPage([W, H]);
	let y = H - M;
	const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = INK) =>
		page.drawText(safe(s), { x, y: yy, size, font: f, color });
	const right = (s: string, xr: number, yy: number, size = 9, f: PDFFont = font, color = INK) =>
		text(s, xr - f.widthOfTextAtSize(safe(s), size), yy, size, f, color);
	const ensure = (h: number) => {
		if (y - h < M) {
			page = doc.addPage([W, H]);
			y = H - M;
		}
	};
	/** Título de sección; `need` es lo que ocupa lo que va debajo, para no dejarlo huérfano. */
	const heading = (s: string, sub?: string, need = 40) => {
		ensure(need + 41);
		y -= 18;
		text(s, M, y, 12, bold);
		if (sub) {
			y -= 13;
			text(sub, M, y, 8.5, font, MUTED);
		}
		y -= 10;
	};
	const table = (cols: Col[], rows: string[][]) => {
		const rowH = 15;
		const head = () => {
			let x = M;
			for (const c of cols) {
				if (c.align === 'right') right(c.label, x + c.width, y - 10, 8, bold, MUTED);
				else text(c.label, x, y - 10, 8, bold, MUTED);
				x += c.width;
			}
			y -= rowH;
		};
		ensure(rowH * 2);
		head();
		for (const r of rows) {
			if (y - rowH < M) {
				page = doc.addPage([W, H]);
				y = H - M;
				head();
			}
			page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
			let x = M;
			r.forEach((v, i) => {
				const c = cols[i]!;
				if (c.align === 'right') right(v, x + c.width, y - 10.5);
				else text(v, x, y - 10.5);
				x += c.width;
			});
			y -= rowH;
		}
	};

	// Cabecera
	text('Informe de servicio', M, y - 16, 18, bold);
	y -= 34;
	text(
		`${meta.brandName} · ${PERIOD_LABEL[data.period]} · ${monthLabel(data.months[0]!, true)} - ${monthLabel(data.months.at(-1)!, true)}`,
		M,
		y,
		10
	);
	y -= 13;
	text(
		`Generado el ${meta.generatedAt.slice(8, 10)}/${meta.generatedAt.slice(5, 7)}/${meta.generatedAt.slice(0, 4)} ${meta.generatedAt.slice(11, 16)} por ${meta.generatedBy}`,
		M,
		y,
		8.5,
		font,
		MUTED
	);
	if (data.histUntil && data.liveFrom <= data.months.at(-1)!) {
		y -= 12;
		text(
			`Hasta ${monthLabel(data.histUntil, true)}, histórico de seguimiento; desde ${monthLabel(data.liveFrom, true)}, datos del portal.`,
			M,
			y,
			8.5,
			font,
			MUTED
		);
	}
	y -= 18;

	// Indicadores
	const cards = kpiCards(data.kpis, data.otifTarget, data.period);
	const cw = (W - 2 * M - 4 * 8) / 5;
	cards.forEach((k, i) => {
		const x = M + i * (cw + 8);
		page.drawRectangle({
			x,
			y: y - 62,
			width: cw,
			height: 62,
			borderColor: LINE,
			borderWidth: 0.75
		});
		const words = safe(k.label).split(' ');
		let l1 = '';
		let l2 = '';
		for (const w of words) {
			if (!l2 && font.widthOfTextAtSize(`${l1} ${w}`.trim(), 7.5) <= cw - 12)
				l1 = `${l1} ${w}`.trim();
			else l2 = `${l2} ${w}`.trim();
		}
		text(l1, x + 6, y - 12, 7.5, font, MUTED);
		if (l2) text(l2, x + 6, y - 21, 7.5, font, MUTED);
		text(k.value, x + 6, y - 38, 13, bold);
		text(k.sub, x + 6, y - 53, 7, font, MUTED);
	});
	y -= 76;

	// OTIF por mes
	const o = charts.otif;
	heading(
		'Entregas a tiempo por mes',
		`% OTIF · objetivo ${fmtPct(data.otifTarget, 0)}`,
		o.frame.height
	);
	ensure(o.frame.height);
	const top = y;
	for (const t of o.yTicks) {
		page.drawLine({
			start: { x: M + o.frame.left, y: top - t.pos },
			end: { x: M + o.frame.width - o.frame.right, y: top - t.pos },
			thickness: 0.5,
			color: LINE
		});
		right(t.label, M + o.frame.left - 4, top - t.pos - 3, 7, font, MUTED);
	}
	for (const t of o.xTicks) {
		const w = font.widthOfTextAtSize(t.label, 7);
		text(t.label, M + t.pos - w / 2, top - o.frame.height + 6, 7, font, MUTED);
	}
	if (o.target) {
		page.drawLine({
			start: { x: M + o.frame.left, y: top - o.target.y },
			end: { x: M + o.frame.width - o.frame.right, y: top - o.target.y },
			thickness: 0.75,
			color: MUTED
		});
		right(o.target.label, M + o.frame.width - o.frame.right, top - o.target.y + 3, 7, font, MUTED);
	}
	if (o.path) page.drawSvgPath(o.path, { x: M, y: top, borderColor: series(1), borderWidth: 2 });
	for (const d of o.dots)
		page.drawCircle({
			x: M + d.x,
			y: top - d.y,
			size: 2.5,
			color: series(1),
			borderColor: rgb(1, 1, 1),
			borderWidth: 1
		});
	y -= o.frame.height + 4;

	// Consumo por marca
	heading('Consumo por marca', 'piezas por mes', charts.consumo.frame.height + 14);
	const legendY = y - 4;
	let lx = M;
	for (const b of data.byBrand) {
		const slot =
			charts.consumo.columns.flatMap((c) => c.segs).find((s) => s.key === b.code)?.slot ?? 1;
		page.drawRectangle({ x: lx, y: legendY - 7, width: 7, height: 7, color: series(slot) });
		text(b.name, lx + 11, legendY - 7, 8, font, MUTED);
		lx += 22 + font.widthOfTextAtSize(safe(b.name), 8);
	}
	y -= 14;
	const s = charts.consumo;
	ensure(s.frame.height);
	const top2 = y;
	for (const t of s.yTicks) {
		page.drawLine({
			start: { x: M + s.frame.left, y: top2 - t.pos },
			end: { x: M + s.frame.width - s.frame.right, y: top2 - t.pos },
			thickness: 0.5,
			color: LINE
		});
		right(t.label, M + s.frame.left - 4, top2 - t.pos - 3, 7, font, MUTED);
	}
	for (const t of s.xTicks) {
		const w = font.widthOfTextAtSize(t.label, 7);
		text(t.label, M + t.pos - w / 2, top2 - s.frame.height + 6, 7, font, MUTED);
	}
	for (const c of s.columns)
		for (const seg of c.segs) page.drawSvgPath(seg.d, { x: M, y: top2, color: series(seg.slot) });
	y -= s.frame.height + 4;

	// Incidencias por tipo
	const inc = charts.incidencias;
	heading('Incidencias por tipo', `${fmtInt(inc.total)} en el periodo`, inc.size + 10);
	if (inc.total) {
		ensure(inc.size + 10);
		const cx = M + inc.size / 2;
		const cy = y - inc.size / 2;
		for (const a of inc.arcs) page.drawSvgPath(a.d, { x: cx, y: cy, color: series(a.slot) });
		const saveY = y;
		const tx = M + inc.size + 24;
		let ty = y - 10;
		text('Tipo', tx, ty, 8, bold, MUTED);
		right('N.º', tx + 220, ty, 8, bold, MUTED);
		right('%', tx + 270, ty, 8, bold, MUTED);
		for (const a of inc.arcs) {
			ty -= 16;
			page.drawRectangle({ x: tx, y: ty, width: 7, height: 7, color: series(a.slot) });
			text(a.key, tx + 12, ty, 9);
			right(String(a.value), tx + 220, ty, 9);
			right(`${Math.round(a.share * 100)} %`, tx + 270, ty, 9);
		}
		y = Math.min(saveY - inc.size, ty) - 12;
	} else {
		text('Sin incidencias en el periodo.', M, y - 10, 9, font, MUTED);
		y -= 20;
	}

	// Aprobación
	heading(
		'Tiempo medio de aprobación',
		'días laborables desde la subida del arte final hasta su aprobación'
	);
	table(
		[
			{ label: 'Marca', width: 260 },
			{ label: 'Aprobaciones', width: 120, align: 'right' },
			{ label: 'Días de media', width: 135, align: 'right' }
		],
		data.byBrand.map((b) => [b.name, fmtInt(b.approvals), fmtDays(b.approvalAvg)])
	);

	// Detalle mensual: la tabla de la que salen las cifras de cabecera.
	heading('Detalle por mes');
	table(
		[
			{ label: 'Mes', width: 85 },
			{ label: 'Bultos', width: 55, align: 'right' },
			{ label: 'A tiempo', width: 60, align: 'right' },
			{ label: 'OTIF', width: 55, align: 'right' },
			{ label: 'Incid.', width: 45, align: 'right' },
			{ label: 'Piezas', width: 75, align: 'right' },
			{ label: 'Pedidos', width: 55, align: 'right' },
			{ label: 'Importe', width: 85, align: 'right' }
		],
		data.byMonth.map((r) => [
			monthLabel(r.month, true),
			fmtInt(r.parcels),
			fmtInt(r.parcelsOk),
			fmtPct(r.otif),
			fmtInt(r.incidents),
			fmtCompact(r.pieces),
			fmtInt(r.orders),
			money(r.orderCents)
		])
	);

	heading('Reposiciones por restaurante', 'top 5 · pedidos hechos en el portal');
	if (data.topRestaurants.length)
		table(
			[
				{ label: 'Restaurante', width: 300 },
				{ label: 'Pedidos', width: 100, align: 'right' },
				{ label: 'Importe', width: 115, align: 'right' }
			],
			data.topRestaurants.map((t) => [t.name, fmtInt(t.orders), money(t.cents)])
		);
	else {
		text('Sin pedidos en el periodo.', M, y - 10, 9, font, MUTED);
		y -= 20;
	}

	heading('Soportes con mayor consumo', 'piezas según el brief de las campañas del periodo');
	if (data.topSupports.length)
		table(
			[
				{ label: 'Soporte', width: 330 },
				{ label: 'Marca', width: 80 },
				{ label: 'Piezas', width: 105, align: 'right' }
			],
			data.topSupports.map((t) => [t.name, t.brandCode, fmtInt(t.pieces)])
		);
	else text('Sin campañas en el periodo.', M, y - 10, 9, font, MUTED);

	const pages = doc.getPages();
	pages.forEach((p, i) => {
		const label = safe(`${title} · página ${i + 1} de ${pages.length}`);
		p.drawText(label, { x: M, y: M / 2, size: 7, font, color: MUTED });
	});
	return doc.save();
}
