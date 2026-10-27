import { describe, expect, it } from 'vitest';
import { compactVersionCode, parseVersionCode } from '$lib/domain/version-code';

describe('códigos de versión (tarifa · surtido · idioma)', () => {
	it.each([
		['C2 ALL SP', 'C2', 'ALL', 'SP', null],
		['C2 RED+ SP', 'C2', 'RED+', 'SP', null],
		['C3+ ALL CAT', 'C3+', 'ALL', 'CAT', null],
		['WARNER SP', 'WARNER', null, 'SP', null],
		['WARNER SP MOD. ESP.', 'WARNER', null, 'SP', 'MOD. ESP.'],
		['VSM CAST', 'VSM', null, 'CAST', null],
		['HÍBRIDOS CAST', 'HÍBRIDOS', null, 'CAST', null],
		['M2 ING', 'M2', null, 'ING', null],
		['  c2   all   gall ', 'C2', 'ALL', 'GALL', null]
	])('%s', (code, tariff, assortment, language, variant) => {
		expect(parseVersionCode(code)).toMatchObject({ tariff, assortment, language, variant });
	});

	it('los esquemas que no son tarifa · idioma se guardan sin descomponer', () => {
		expect(parseVersionCode('mod. A 14,25')).toEqual({
			code: 'mod. A 14,25',
			tariff: null,
			assortment: null,
			language: null,
			variant: null
		});
		expect(parseVersionCode('C2 ALL').language).toBeNull();
	});

	it('normaliza espacios y compacta para QR', () => {
		expect(parseVersionCode('C2  RED+   SP').code).toBe('C2 RED+ SP');
		expect(compactVersionCode('C2 RED+ SP')).toBe('C2RED+SP');
	});
});
