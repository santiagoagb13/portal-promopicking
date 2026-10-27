import { describe, expect, it } from 'vitest';
import { codeKey, faceLabel, parseArtworkFilename } from '$lib/domain/artwork';
import { can, type Actor } from '$lib/permissions';

describe('código de versión desde el nombre del fichero', () => {
	const existing = ['C2 RED+ SP', 'C2 ALL CAT', 'WARNER SP MOD. ESP.', 'mod. A 14,25'];
	it.each([
		['FH-01_C2-RED+-SP_v2.pdf', 'C2 RED+ SP', 2, true],
		['FH-01_C2-ALL-CAT_v1.PDF', 'C2 ALL CAT', 1, true],
		['c2 all cat.pdf', 'C2 ALL CAT', null, true],
		['FH-04_WARNER-SP-MOD-ESP_v1.pdf', 'WARNER SP MOD. ESP.', 1, true],
		['VI-07_mod-A-14-25_v1.pdf', 'mod. A 14,25', 1, true],
		['FH-01_C4-ALL-SP_v3.pdf', 'C4 ALL SP', 3, false]
	])('%s → %s', (name, code, revision, matched) => {
		expect(parseArtworkFilename(name, existing)).toEqual({ code, revision, matched });
	});
	it('compara sin espacios, guiones, puntos ni mayúsculas', () => {
		expect(codeKey('mod. A 14,25')).toBe(codeKey('MOD-A-14-25'));
		expect(codeKey('C2 RED+ SP')).not.toBe(codeKey('C2 RED SP'));
	});
});

describe('caras del visor', () => {
	it('tríptico de dos páginas: exterior e interior; resto, páginas', () => {
		expect(faceLabel('triptico', 1, 2)).toBe('Exterior');
		expect(faceLabel('triptico', 2, 2)).toBe('Interior');
		expect(faceLabel('page', 1, 1)).toBe('Página 1');
		expect(faceLabel('triptico', 3, 4)).toBe('Página 3');
	});
});

describe('permisos de aprobación', () => {
	const a = (role: Actor['role'], brands: string[] = []): Actor => ({
		id: role,
		role,
		status: 'active',
		brands,
		restaurants: []
	});
	it('suben Promopicking y producción; aprueba solo la marca; el gerente ni ve', () => {
		expect(can(a('production'), 'artwork.upload')).toBe(true);
		expect(can(a('brand', ['FH']), 'artwork.upload')).toBe(false);
		expect(can(a('brand', ['FH']), 'artwork.decide', { brandCode: 'FH' })).toBe(true);
		expect(can(a('admin'), 'artwork.decide', { brandCode: 'FH' })).toBe(false);
		expect(can(a('manager'), 'artwork.view')).toBe(false);
	});
});
