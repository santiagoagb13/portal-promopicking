import { describe, expect, it } from 'vitest';
import {
	checkScan,
	kitIdFor,
	labelUrl,
	nextStep,
	parseKitCode,
	versionFor
} from '$lib/domain/kits';
import { photoType } from '$lib/server/services/kits';
import { can, type Actor } from '$lib/permissions';

describe('estados y pasos del kit', () => {
	it('el siguiente paso de cada estado', () => {
		expect([0, 1, 2, 3, 4].map(nextStep)).toEqual([
			'shipped',
			'hub_in',
			'out_for_delivery',
			null,
			null
		]);
	});
	it('solo se registra el paso siguiente; lo ya hecho no es un error', () => {
		expect(checkScan(0, 'shipped')).toEqual({ ok: true, already: false });
		expect(checkScan(2, 'hub_in')).toEqual({ ok: true, already: true });
		expect(checkScan(4, 'shipped')).toEqual({ ok: true, already: true });
		expect(checkScan(0, 'hub_in')).toEqual({
			ok: false,
			message: 'Falta registrar «Expedición» antes'
		});
	});
});

describe('códigos de kit', () => {
	it('id con el formato del prototipo', () => {
		expect(kitIdFor('FH-26-09', 'FH-0147')).toBe('K-FH2609-0147');
		expect(kitIdFor('VI-26-03b', 'VI-0023')).toBe('K-VI2603B-0023');
	});
	it.each([
		['K-FH2609-0147', 'K-FH2609-0147', null],
		['  k-fh2609-0147  ', 'K-FH2609-0147', null],
		['K-FH2609-0147/2', 'K-FH2609-0147', 2],
		['https://portal.example/k/K-FH2609-0147/3', 'K-FH2609-0147', 3],
		['http://localhost:4173/k/K-VI2603b-0023/1', 'K-VI2603B-0023', 1]
	])('%s', (text, kitId, parcel) => {
		expect(parseKitCode(text)).toEqual({ kitId, parcel });
	});
	it('rechaza lo que no es un kit', () => {
		expect(parseKitCode('8412345678905')).toBeNull();
		expect(parseKitCode('')).toBeNull();
	});
	it('el QR de la etiqueta apunta al portal', () => {
		expect(labelUrl('https://portal.example', 'K-FH2609-0147', 2)).toBe(
			'https://portal.example/k/K-FH2609-0147/2'
		);
	});
});

describe('versión que recibe cada restaurante', () => {
	const versions = [
		{ code: 'C2 ALL SP', tariff: 'C2', assortment: 'ALL', language: 'SP' },
		{ code: 'C2 ALL CAT', tariff: 'C2', assortment: 'ALL', language: 'CAT' },
		{ code: 'C2 RED+ SP', tariff: 'C2', assortment: 'RED+', language: 'SP' },
		{ code: 'C3+ ALL SP', tariff: 'C3+', assortment: 'ALL', language: 'SP' }
	];
	it('por tarifa, surtido e idioma (idioma compuesto: el primero)', () => {
		expect(versionFor({ tariff: 'C2', assortment: 'RED+', language: 'SP' }, versions)).toBe(
			'C2 RED+ SP'
		);
		expect(versionFor({ tariff: 'C3+', assortment: 'ALL', language: 'SP + EN' }, versions)).toBe(
			'C3+ ALL SP'
		);
		expect(versionFor({ tariff: 'C2', assortment: 'ALL', language: 'CAT' }, versions)).toBe(
			'C2 ALL CAT'
		);
	});
	it('sin coincidencia exacta: por idioma, versión única o código compuesto', () => {
		expect(
			versionFor({ tariff: 'VIPS', assortment: 'Completa', language: 'CAT' }, [
				{ code: 'Carta CAT', tariff: null, assortment: null, language: 'CAT' },
				{ code: 'Carta CAST', tariff: null, assortment: null, language: 'CAST' }
			])
		).toBe('Carta CAT');
		expect(
			versionFor({ tariff: 'M3', assortment: 'Completa', language: 'CAST' }, [
				{ code: 'Única', tariff: null, assortment: null, language: null }
			])
		).toBe('Única');
		expect(versionFor({ tariff: 'C1', assortment: 'ALL', language: 'GALL' }, versions)).toBe(
			'C1 GALL'
		);
	});
});

describe('fotos y permisos', () => {
	it('tipo de imagen por su firma', () => {
		expect(photoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
		expect(photoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
		expect(photoType(new TextEncoder().encode('RIFF1234WEBPVP8 '))).toBe('webp');
		expect(photoType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
	});
	it('producción solo expide; el gerente recibe lo suyo y no escanea', () => {
		const a = (role: Actor['role'], restaurants: Actor['restaurants'] = []): Actor => ({
			id: role,
			role,
			status: 'active',
			brands: [],
			restaurants
		});
		expect(can(a('production'), 'kit.scan', { scanStep: 'shipped' })).toBe(true);
		expect(can(a('production'), 'kit.scan', { scanStep: 'out_for_delivery' })).toBe(false);
		const ana = a('manager', [{ id: 'FH-0147', brandCode: 'FH' }]);
		expect(can(ana, 'kit.receive', { restaurantId: 'FH-0147' })).toBe(true);
		expect(can(ana, 'kit.scan', { scanStep: 'shipped' })).toBe(false);
	});
});
