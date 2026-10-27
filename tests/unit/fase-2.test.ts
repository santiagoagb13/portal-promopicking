import { describe, expect, it } from 'vitest';
import {
	MILESTONE_OFFSETS,
	milestonesFor,
	nextCampaignId,
	offsetsProblem
} from '$lib/domain/campaign';
import { monthGrid, monthLabel, shiftMonth } from '$lib/domain/calendar';
import {
	changedFields,
	diffImport,
	editableFields,
	parseCsv,
	toCsv,
	type RestaurantRecord
} from '$lib/domain/master';
import { can, type Actor } from '$lib/permissions';

describe('códigos de campaña', () => {
	it('siguen la serie de la marca y el año', () => {
		expect(nextCampaignId('FH', '2026-12-01', ['FH-26-06', 'FH-26-11', 'FH-27-01'])).toBe(
			'FH-26-12'
		);
		expect(nextCampaignId('VI', '2026-11-05', ['VI-26-03', 'VI-26-03b', 'VI-26-08'])).toBe(
			'VI-26-09'
		);
		expect(nextCampaignId('GI', '2028-01-10', ['GI-27-08'])).toBe('GI-28-01');
	});
});

describe('plazos de las fases', () => {
	it('los de por defecto son válidos y reproducen calDates', () => {
		expect(offsetsProblem(MILESTONE_OFFSETS)).toBeNull();
		expect(milestonesFor('2026-11-12', { ...MILESTONE_OFFSETS, brief: -45 }).brief).toBe(
			'2026-09-28'
		);
	});
	it('rechazan hitos desordenados, positivos o un día en restaurante distinto de 0', () => {
		expect(offsetsProblem({ ...MILESTONE_OFFSETS, af: -50 })).toMatch(/no puede ir antes/);
		expect(offsetsProblem({ ...MILESTONE_OFFSETS, kitting: 3 })).toMatch(/entre 0 y 365/);
		expect(offsetsProblem({ ...MILESTONE_OFFSETS, rte: -1 })).not.toBeNull();
	});
});

describe('calendario mensual', () => {
	it('octubre de 2026 empieza en jueves y ocupa semanas completas de lunes a domingo', () => {
		const days = monthGrid('2026-10', [{ day: '2026-10-26', id: 'x' }]);
		expect(days[0]!.day).toBe('2026-09-28');
		expect(days.length % 7).toBe(0);
		expect(days.at(-1)!.day).toBe('2026-11-01');
		expect(days.find((d) => d.day === '2026-10-26')!.items).toHaveLength(1);
		expect(days.filter((d) => d.inMonth)).toHaveLength(31);
	});
	it('etiquetas y cambio de mes', () => {
		expect(monthLabel('2026-10')).toBe('octubre 2026');
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
	});
});

const rest = (id: string, extra: Partial<RestaurantRecord> = {}): RestaurantRecord => ({
	id,
	brandCode: id.startsWith('FH') ? 'FH' : 'VIPS',
	name: `Rte ${id}`,
	city: 'Madrid',
	address: 'Calle 1',
	tariff: id.startsWith('FH') ? 'C2' : 'VIPS',
	language: id.startsWith('FH') ? 'SP' : 'CAST',
	assortment: id.startsWith('FH') ? 'ALL' : 'Completa',
	facade: null,
	deliveryPoint: 'Plataforma Promopicking',
	active: true,
	...extra
});
const PREFIXES = { FH: 'FH', VIPS: 'VI', GINOS: 'GI' };
const HEAD = [
	'Código',
	'Marca',
	'Nombre',
	'Ciudad',
	'Dirección',
	'Tarifa',
	'Idioma',
	'Surtido',
	'Fachada',
	'Entrega'
];
const row = (r: RestaurantRecord, over: Record<number, string> = {}) =>
	[
		r.id,
		r.brandCode,
		r.name,
		r.city,
		r.address,
		r.tariff,
		r.language,
		r.assortment,
		r.facade ?? '',
		r.deliveryPoint
	].map((v, i) => over[i] ?? v);

describe('importación del maestro', () => {
	const existing = [rest('FH-0001'), rest('FH-0002'), rest('FH-0003'), rest('VI-0001')];

	it('detecta altas, cambios y bajas solo en las marcas del fichero', () => {
		const table = [
			HEAD,
			row(existing[0]!),
			row(existing[1]!, { 5: 'C3', 2: 'Nuevo nombre' }),
			row(rest('FH-0009'), { 2: 'Alta nueva' })
		];
		const d = diffImport(table, existing, ['FH', 'VIPS', 'GINOS'], PREFIXES);
		expect(d.errors).toEqual([]);
		expect(d.added.map((r) => r.id)).toEqual(['FH-0009']);
		expect(d.changed).toEqual([
			{
				id: 'FH-0002',
				changes: {
					name: { from: 'Rte FH-0002', to: 'Nuevo nombre' },
					tariff: { from: 'C2', to: 'C3' }
				}
			}
		]);
		// FH-0003 no está en el fichero: baja. VI-0001 no se toca porque VIPS no viene en el fichero.
		expect(d.removed).toEqual([{ id: 'FH-0003', name: 'Rte FH-0003' }]);
		expect(d.brands).toEqual(['FH']);
	});

	it('valida códigos, marcas fuera de ámbito, valores cerrados y repetidos', () => {
		const table = [
			HEAD,
			row(rest('FH-12'), {}),
			row(rest('VI-0001')),
			row(existing[0]!, { 6: 'KLINGON' }),
			row(existing[1]!),
			row(existing[1]!)
		];
		const d = diffImport(table, existing, ['FH'], PREFIXES);
		expect(d.errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
		expect(d.errors[0]!.message).toMatch(/FH-0000/);
		expect(d.errors[1]!.message).toMatch(/no puedes importar/);
		expect(d.errors[2]!.message).toMatch(/idioma «KLINGON»/);
		expect(d.errors[3]!.message).toMatch(/repetido/);
	});

	it('exige la columna de código y acepta cabeceras con otra forma', () => {
		expect(diffImport([['Nombre'], ['x']], existing, ['FH'], PREFIXES).errors[0]!.message).toMatch(
			/Código/
		);
		const d = diffImport(
			[
				['CODIGO', 'restaurante', 'tarifa'],
				['FH-0001', 'Rte FH-0001', 'C3']
			],
			existing,
			['FH'],
			PREFIXES
		);
		expect(d.changed[0]!.changes).toEqual({ tariff: { from: 'C2', to: 'C3' } });
	});

	it('CSV con «;», comillas y BOM, ida y vuelta', () => {
		const csv = toCsv([
			['Código', 'Dirección'],
			['FH-0001', 'C/ Mayor; 3 "bajo"']
		]);
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(parseCsv(csv)).toEqual([
			['Código', 'Dirección'],
			['FH-0001', 'C/ Mayor; 3 "bajo"']
		]);
		expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});
});

describe('edición del maestro', () => {
	it('qué campos edita cada rol (decisión pendiente 7)', () => {
		expect(editableFields('ops')).toContain('deliveryPoint');
		expect(editableFields('brand')).toContain('tariff');
		expect(editableFields('brand')).not.toContain('deliveryPoint');
		expect(editableFields('manager')).toEqual([]);
		expect(editableFields('production')).toEqual([]);
	});
	it('campos que cambian', () => {
		expect(changedFields({ tariff: 'C2', name: 'A' }, { tariff: 'C3', name: 'A' })).toEqual([
			'tariff'
		]);
		expect(changedFields({ facade: null }, { facade: '' })).toEqual([]);
	});
});

describe('permisos de la fase 2', () => {
	const a = (role: Actor['role'], brands: string[] = []): Actor => ({
		id: role,
		role,
		status: 'active',
		brands,
		restaurants: []
	});
	it('altas, bajas e importación del maestro solo internas; validar también la marca', () => {
		expect(can(a('ops'), 'restaurant.import')).toBe(true);
		expect(can(a('brand', ['FH']), 'restaurant.import')).toBe(false);
		expect(can(a('brand', ['FH']), 'restaurant.create')).toBe(false);
		expect(can(a('brand', ['FH']), 'master.validate', { brandCode: 'FH' })).toBe(true);
		expect(can(a('brand', ['FH']), 'master.validate', { brandCode: 'VIPS' })).toBe(false);
		expect(can(a('production'), 'master.validate')).toBe(false);
	});
	it('ajustes solo administración', () => {
		expect(can(a('admin'), 'settings.edit')).toBe(true);
		expect(can(a('ops'), 'settings.edit')).toBe(false);
	});
});
