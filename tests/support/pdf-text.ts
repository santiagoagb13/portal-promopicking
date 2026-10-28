/** Texto de un PDF, página a página, para comprobar lo exportado (pdfjs sin canvas). */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
// pdfjs pide la ruta en disco de sus fuentes estándar, no una URL file://.
const FONTS = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';

export async function pdfText(bytes: Uint8Array): Promise<string> {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = getDocument({
		data: bytes.slice(),
		standardFontDataUrl: FONTS
	});
	const doc = await task.promise;
	const pages: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const content = await (await doc.getPage(i)).getTextContent();
		pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
	}
	await task.destroy();
	return pages.join('\n').replace(/\s+/g, ' ');
}
