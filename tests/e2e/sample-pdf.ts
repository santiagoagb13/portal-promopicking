import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** PDF de dos caras para probar la subida (sin depender del código del servidor). */
export async function samplePdfForTests(code: string, revision: number): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	for (const face of ['Exterior', 'Interior']) {
		const page = doc.addPage([999, 480]);
		page.drawRectangle({ x: 24, y: 384, width: 300, height: 56, color: rgb(0.6, 0.23, 0.13) });
		page.drawText(`${code} · rev. ${revision} · ${face}`, {
			x: 36,
			y: 340,
			size: 22,
			font,
			color: rgb(0.07, 0.07, 0.07)
		});
	}
	return doc.save();
}
