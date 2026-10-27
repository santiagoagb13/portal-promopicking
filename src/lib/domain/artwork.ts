import { normalizeVersionCode } from './version-code';

/** Clave para comparar códigos sin importar espacios, guiones, puntos ni mayúsculas. */
export function codeKey(code: string): string {
	return code
		.normalize('NFC')
		.toUpperCase()
		.replace(/[^A-Z0-9+ÁÉÍÓÚÑÜ]/g, '');
}

/**
 * Lee el código de versión del nombre del fichero (8.5), con la convención del prototipo:
 * `FH-01_C2-RED+-SP_v2.pdf` → `C2 RED+ SP`, revisión 2. Si coincide con un código existente
 * del soporte, se devuelve ese código tal cual.
 */
export function parseArtworkFilename(
	name: string,
	existing: string[] = []
): { code: string; revision: number | null; matched: boolean } {
	let base = name.replace(/\.[Pp][Dd][Ff]$/, '').trim();
	let revision: number | null = null;
	const rev = base.match(/[_\s-]v(\d{1,3})$/i);
	if (rev) {
		revision = Number(rev[1]);
		base = base.slice(0, rev.index);
	}
	// Prefijo de soporte (`FH-01_`) si lo hay.
	base = base.replace(/^[A-Za-z]{2,3}-\d{1,3}_/, '');
	const human = normalizeVersionCode(base.replace(/[_-]+/g, ' '));
	const key = codeKey(human);
	const hit = existing.find((c) => codeKey(c) === key);
	return { code: hit ?? human, revision, matched: !!hit };
}

/** Caras del visor: los trípticos tienen exterior e interior; el resto, páginas numeradas. */
export function faceLabel(format: string | null, page: number, pageCount: number): string {
	if (format === 'triptico' && pageCount === 2) return page === 1 ? 'Exterior' : 'Interior';
	return `Página ${page}`;
}

/** Ventana para deshacer una aprobación (7.1, regla 5): 8 s en pantalla y algo de margen en el servidor. */
export const UNDO_SECONDS = 30;
