import { describe, expect, it } from 'vitest';
import { businessDays, fmtPct, kpiCards, monthEnd, monthsFor } from '$lib/domain/reports';
import { titleFrom } from '$lib/domain/tickets';
import { can, type Actor } from '$lib/permissions';
import { donut, stackedColumns } from '$lib/server/charts';

describe('periodos del informe', () => {
	it('12 meses, trimestre y año hasta el mes actual', () => {
		expect(monthsFor('12m', '2026-10-28')).toEqual([
			'2025-11',
			'2025-12',
			'2026-01',
			'2026-02',
			'2026-03',
			'2026-04',
			'2026-05',
			'2026-06',
			'2026-07',
			'2026-08',
			'2026-09',
			'2026-10'
		]);
		expect(monthsFor('trimestre', '2026-01-05')).toEqual(['2025-11', '2025-12', '2026-01']);
		expect(monthsFor('anio', '2026-03-31')).toEqual(['2026-01', '2026-02', '2026-03']);
		expect(monthEnd('2028-02')).toBe('2028-02-29');
	});
	it('días laborables con fracción, sin fines de semana', () => {
		const at = (s: string) => new Date(`${s}Z`);
		expect(businessDays(at('2026-10-23T09:00:00'), at('2026-10-23T21:00:00'))).toBe(0.5); // viernes
		expect(businessDays(at('2026-10-23T12:00:00'), at('2026-10-26T12:00:00'))).toBe(1); // vie → lun
		expect(businessDays(at('2026-10-24T10:00:00'), at('2026-10-25T10:00:00'))).toBe(0); // fin de semana
		expect(businessDays(at('2026-10-26T00:00:00'), at('2026-10-19T00:00:00'))).toBe(0);
	});
	it('las cifras de cabecera se escriben igual en la página y en el PDF', () => {
		const cards = kpiCards(
			{
				otif: 97.15,
				incidentRate: 1.11,
				incidents: 100,
				parcels: 8972,
				pieces: 4_732_213,
				orders: 288,
				orderCents: 1_377_229,
				approvalAvg: 2.06
			},
			97,
			'12m'
		);
		expect(cards.map((c) => c.value)).toEqual([
			'97,2 %',
			'1,1 %',
			'4,73 M',
			'288 pedidos',
			'2,1 días'
		]);
		expect(cards[1]!.sub).toBe('100 de 8972 bultos');
		expect(fmtPct(null)).toBe('—');
	});
});

describe('gráficos', () => {
	it('columnas de 24 px como mucho y 2 px entre segmentos', () => {
		const c = stackedColumns(
			['a', 'b'],
			[
				{ key: 'FH', slot: 1, name: 'FH', values: [100, 0] },
				{ key: 'VIPS', slot: 2, name: 'VIPS', values: [50, 10] }
			],
			{ width: 600, height: 200 }
		);
		expect(c.columns[0]!.segs).toHaveLength(2);
		expect(c.columns[1]!.segs.map((s) => s.key)).toEqual(['VIPS']);
		const widths = c.columns[0]!.segs.map((s) => Number(/h([\d.]+)/.exec(s.d)?.[1] ?? 24));
		expect(Math.max(...widths)).toBeLessThanOrEqual(24);
	});
	it('el anillo reparte el total y omite los ceros', () => {
		const d = donut(
			[
				{ key: 'a', slot: 1, value: 3 },
				{ key: 'b', slot: 2, value: 1 },
				{ key: 'c', slot: 3, value: 0 }
			],
			{ size: 120 }
		);
		expect(d.total).toBe(4);
		expect(d.arcs.map((a) => a.share)).toEqual([0.75, 0.25]);
	});
});

describe('soporte', () => {
	it('el título sale de la primera línea del texto', () => {
		expect(titleFrom('  Faltan 2 cartas\nDetalle…')).toBe('Faltan 2 cartas');
		expect(titleFrom('x'.repeat(130))).toHaveLength(120);
	});
	const base = {
		status: 'active' as const,
		brands: [] as string[],
		restaurants: [] as { id: string; brandCode: string }[]
	};
	it('Promopicking gestiona; el responsable asignado responde aunque no lo abriera', () => {
		const ops: Actor = { ...base, id: 'o', role: 'ops' };
		const prod: Actor = { ...base, id: 'p', role: 'production' };
		const manager: Actor = {
			...base,
			id: 'm',
			role: 'manager',
			restaurants: [{ id: 'FH-0147', brandCode: 'FH' }]
		};
		expect(can(ops, 'ticket.manage')).toBe(true);
		expect(can(prod, 'ticket.manage')).toBe(false);
		expect(can(prod, 'ticket.respond', { openedBy: 'x', assignedTo: 'p' })).toBe(true);
		expect(can(prod, 'ticket.respond', { openedBy: 'x', assignedTo: null })).toBe(false);
		expect(can(manager, 'ticket.respond', { openedBy: 'm' })).toBe(false);
	});
});
