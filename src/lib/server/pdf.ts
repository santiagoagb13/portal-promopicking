/**
 * PDF de artes finales (3.3): al subirlos se comprueba que son PDF, se calcula su huella y se
 * convierten las páginas a WebP para el visor, que así no carga ninguna librería. El PDF original
 * solo se descarga. La conversión usa pdf.js con @napi-rs/canvas: sin binarios del sistema, de modo
 * que funciona igual en Vercel que en el VPS.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

/** Tamaño máximo de un PDF de artes (4.3). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Anchuras de las imágenes del visor (srcset). */
export const PAGE_WIDTHS = [800, 1600] as const;
const MAX_PAGES = 24;

export function isPdf(bytes: Uint8Array): boolean {
	const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
	return head.includes('%PDF-');
}

export function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function standardFontsUrl(): string | undefined {
	try {
		const require = createRequire(import.meta.url);
		// En Node pdf.js lee las fuentes estándar del disco: ruta, no URL file://.
		return join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';
	} catch {
		return undefined;
	}
}

export type RenderedPage = {
	page: number;
	width: number;
	height: number;
	images: Record<number, Uint8Array>;
};

/** Convierte las páginas del PDF a WebP en las anchuras de `PAGE_WIDTHS`. */
export async function renderPages(
	bytes: Uint8Array
): Promise<{ pageCount: number; pages: RenderedPage[] }> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = getDocument({
		data: new Uint8Array(bytes),
		disableFontFace: true,
		standardFontDataUrl: standardFontsUrl()
	});
	const pdf = await task.promise;
	const factory = (pdf as unknown as { canvasFactory: CanvasFactory }).canvasFactory;
	const max = Math.max(...PAGE_WIDTHS);
	const pages: RenderedPage[] = [];
	try {
		for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
			const page = await pdf.getPage(n);
			const base = page.getViewport({ scale: 1 });
			const vp = page.getViewport({ scale: max / base.width });
			const w = Math.round(vp.width);
			const h = Math.round(vp.height);
			const big = factory.create(w, h);
			await page.render({ canvasContext: big.context, viewport: vp, canvas: big.canvas } as never)
				.promise;
			const images: Record<number, Uint8Array> = {};
			for (const width of PAGE_WIDTHS) {
				if (width === max) {
					images[width] = new Uint8Array(await big.canvas.encode('webp', 82));
					continue;
				}
				const small = factory.create(width, Math.round((h * width) / w));
				small.context.drawImage(big.canvas, 0, 0, width, Math.round((h * width) / w));
				images[width] = new Uint8Array(await small.canvas.encode('webp', 80));
				factory.destroy(small);
			}
			factory.destroy(big);
			pages.push({ page: n, width: w, height: h, images });
			page.cleanup();
		}
	} finally {
		await task.destroy();
	}
	return { pageCount: pdf.numPages, pages };
}

type CanvasLike = { encode(format: 'webp', quality: number): Promise<Buffer> };
type ContextLike = { drawImage(img: unknown, x: number, y: number, w: number, h: number): void };
type CanvasFactory = {
	create(w: number, h: number): { canvas: CanvasLike; context: ContextLike };
	destroy(c: { canvas: CanvasLike; context: ContextLike }): void;
};

/* ---------- Acta de aprobación (8.5) ---------- */

/** Las fuentes estándar de PDF solo codifican WinAnsi: se sustituye lo que no cabe. */
export function safe(s: string): string {
	return s
		.replace(/[\u00A0\u202F]/g, ' ')
		.replace(/≤/g, '<=')
		.replace(/[→⟶]/g, '->')
		.replace(/[“”«»]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/…/g, '...')
		.replace(/[^\x20-\x7E\u00A1-\u00FF\u20AC]/g, '?');
}

export type CertificateRow = {
	code: string;
	revision: number;
	status: string;
	kits: number | null;
	decidedBy: string | null;
	decidedAt: string | null;
	device: string | null;
	hash: string | null;
};

export async function approvalCertificate(p: {
	support: string;
	campaign: string;
	brand: string;
	artworkLabel: string | null;
	generatedAt: string;
	generatedBy: string;
	rows: CertificateRow[];
}): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.setTitle(safe(`Acta de aprobación · ${p.support}`));
	doc.setAuthor('Portal de servicio Promopicking');
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const mono = await doc.embedFont(StandardFonts.Courier);
	const ink = rgb(0.067, 0.067, 0.067);
	const muted = rgb(0.42, 0.42, 0.42);
	const line = rgb(0.9, 0.9, 0.9);
	const [W, H, M] = [595.28, 841.89, 48];
	let page = doc.addPage([W, H]);
	let y = H - M;

	const text = (s: string, x: number, size: number, f: PDFFont = font, color = ink) =>
		page.drawText(safe(s), { x, y, size, font: f, color, maxWidth: W - x - M });

	const header = () => {
		text('Acta de aprobación de artes finales', M, 18, bold);
		y -= 24;
		text(
			`${p.support} · ${p.campaign} · ${p.brand}${p.artworkLabel ? ` · ${p.artworkLabel}` : ''}`,
			M,
			10,
			font,
			muted
		);
		y -= 14;
		text(`Generada el ${p.generatedAt} por ${p.generatedBy}`, M, 9, font, muted);
		y -= 24;
		const cols: [string, number][] = [
			['Versión', M],
			['Rev.', M + 150],
			['Estado', M + 185],
			['Decisión', M + 260],
			['Huella del fichero', M + 395]
		];
		for (const [label, x] of cols)
			page.drawText(label, { x, y, size: 8, font: bold, color: muted });
		y -= 6;
		page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: line });
		y -= 14;
	};
	header();

	for (const r of p.rows) {
		if (y < M + 40) {
			page = doc.addPage([W, H]);
			y = H - M;
			header();
		}
		page.drawText(safe(r.code), { x: M, y, size: 9, font: mono, color: ink });
		page.drawText(String(r.revision), { x: M + 150, y, size: 9, font, color: ink });
		page.drawText(safe(r.status), { x: M + 185, y, size: 9, font, color: ink });
		page.drawText(safe(r.decidedBy ? `${r.decidedBy} · ${r.decidedAt ?? ''}` : '—'), {
			x: M + 260,
			y,
			size: 8,
			font,
			color: ink,
			maxWidth: 130
		});
		page.drawText(r.hash ? r.hash.slice(0, 16) : '—', {
			x: M + 395,
			y,
			size: 8,
			font: mono,
			color: muted
		});
		if (r.device) {
			y -= 11;
			page.drawText(safe(r.device), { x: M + 260, y, size: 7, font, color: muted, maxWidth: 130 });
		}
		y -= 8;
		page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
		y -= 13;
	}
	return doc.save();
}

/** PDF de muestra para el seed y las pruebas: una página por cara con el código bien visible. */
export async function samplePdf(p: {
	title: string;
	code: string;
	pages: string[];
	revision: number;
	accent: [number, number, number];
}) {
	const doc = await PDFDocument.create();
	// Fechas fijas: el mismo arte da el mismo PDF (y la misma huella) en cada seed.
	const fixed = new Date('2026-10-18T15:00:00Z');
	doc.setCreationDate(fixed);
	doc.setModificationDate(fixed);
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const [r, g, b] = p.accent;
	for (const [i, face] of p.pages.entries()) {
		const [W, H] = p.pages.length > 1 ? [999, 480] : [500, 800];
		const page = doc.addPage([W, H]);
		page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
		const panels = p.pages.length > 1 ? 3 : 1;
		for (let k = 1; k < panels; k++)
			page.drawLine({
				start: { x: (W / panels) * k, y: 0 },
				end: { x: (W / panels) * k, y: H },
				thickness: 1,
				color: rgb(0.85, 0.85, 0.85),
				dashArray: [6, 6]
			});
		page.drawRectangle({
			x: 24,
			y: H - 96,
			width: W / panels - 48,
			height: 56,
			color: rgb(r, g, b)
		});
		page.drawText(safe(p.title), {
			x: 36,
			y: H - 76,
			size: 16,
			font,
			color: rgb(1, 1, 1),
			maxWidth: W / panels - 72
		});
		page.drawText(safe(`${p.code} · rev. ${p.revision}`), {
			x: 36,
			y: H - 130,
			size: 22,
			font,
			color: rgb(0.07, 0.07, 0.07)
		});
		page.drawText(safe(face), {
			x: 36,
			y: H - 156,
			size: 12,
			font: regular,
			color: rgb(0.42, 0.42, 0.42)
		});
		for (let row = 0; row < 8; row++)
			page.drawRectangle({
				x: 36,
				y: H - 200 - row * 26,
				width: (W / panels - 72) * (0.5 + ((row * 37 + i * 11) % 50) / 100),
				height: 8,
				color: rgb(0.8, 0.8, 0.8)
			});
		if (panels > 1)
			for (let k = 1; k < panels; k++) {
				page.drawRectangle({
					x: (W / panels) * k + 24,
					y: 60,
					width: W / panels - 48,
					height: H - 180,
					color: rgb(r * 0.3 + 0.7, g * 0.3 + 0.7, b * 0.3 + 0.7)
				});
				page.drawText(safe(`${face} · panel ${k + 1}`), {
					x: (W / panels) * k + 36,
					y: H - 100,
					size: 12,
					font: regular,
					color: rgb(0.2, 0.2, 0.2)
				});
			}
	}
	return doc.save();
}
