/**
 * Códigos de versión de artes finales: «tarifa · surtido · idioma», p. ej. `C2 RED+ SP`.
 * Algunos soportes usan otros esquemas (`mod. A 14,25`); entonces solo se guarda el código.
 */

export const TARIFFS = ['C1', 'C2', 'C3', 'C3+', 'WARNER', 'VIPS', 'VSM', 'HÍB', 'HÍBRIDOS', 'M2', 'M3', 'M4'];
export const ASSORTMENTS = ['ALL', 'RED', 'RED+', 'WAR'];
export const LANGUAGES = ['SP', 'EN', 'FR', 'CAT', 'GALL', 'CAST', 'ING', 'PORT'];

export type VersionCode = {
	code: string;
	tariff: string | null;
	assortment: string | null;
	language: string | null;
	/** Lo que sobra tras tarifa, surtido e idioma (p. ej. `MOD. ESP.`). */
	variant: string | null;
};

export function normalizeVersionCode(code: string): string {
	return code.trim().replace(/\s+/g, ' ');
}

export function parseVersionCode(raw: string): VersionCode {
	const code = normalizeVersionCode(raw);
	const parts = code.split(' ');
	const none: VersionCode = { code, tariff: null, assortment: null, language: null, variant: null };
	const tariff = parts[0]?.toUpperCase();
	if (!tariff || !TARIFFS.includes(tariff)) return none;
	let i = 1;
	let assortment: string | null = null;
	if (parts[i] && ASSORTMENTS.includes(parts[i]!.toUpperCase())) assortment = parts[i++]!.toUpperCase();
	const language = parts[i] && LANGUAGES.includes(parts[i]!.toUpperCase()) ? parts[i++]!.toUpperCase() : null;
	if (!language) return none;
	const rest = parts.slice(i).join(' ');
	return { code, tariff, assortment, language, variant: rest || null };
}

/** Código compacto para QR y nombres de fichero: `C2 RED+ SP` → `C2RED+SP`. */
export function compactVersionCode(code: string): string {
	return normalizeVersionCode(code).replace(/[^A-Za-z0-9+ÁÉÍÓÚÑáéíóúñ]/g, '').toUpperCase();
}
