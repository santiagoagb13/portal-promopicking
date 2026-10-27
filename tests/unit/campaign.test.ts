import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	campaignProgress,
	campaignStage,
	milestoneDone,
	milestonesFor,
	semaphore,
	stageLabel,
	stageTone
} from '$lib/domain/campaign';
import { addDays, daysBetween, fmtDay, relDays } from '$lib/domain/dates';

const TODAY = '2026-10-22';

describe('hitos (calDates del prototipo)', () => {
	it('se calculan hacia atrás desde la fecha en restaurante', () => {
		expect(milestonesFor('2026-11-12')).toEqual({
			brief: '2026-10-03',
			af: '2026-10-17',
			aprob: '2026-10-24',
			prod_ini: '2026-10-25',
			prod_fin: '2026-11-02',
			kitting: '2026-11-03',
			exped: '2026-11-05',
			plataforma: '2026-11-07',
			rte: '2026-11-12'
		});
	});

	it('cruzan bien los cambios de mes y de año', () => {
		expect(milestonesFor('2027-01-12').brief).toBe('2026-12-03');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('un hito de fase está hecho si la campaña ya pasó esa fase', () => {
		expect(milestoneDone('aprob', 3, '2026-10-24', TODAY)).toBe(true);
		expect(milestoneDone('aprob', 2, '2026-10-24', TODAY)).toBe(false);
		expect(milestoneDone('rte', 6, '2026-10-19', TODAY)).toBe(true);
		// Los hitos sin fase (inicio de producción, plataforma) dependen de la fecha.
		expect(milestoneDone('prod_ini', 0, '2026-10-20', TODAY)).toBe(true);
		expect(milestoneDone('plataforma', 0, '2026-10-30', TODAY)).toBe(false);
	});
});

describe('fase y progreso', () => {
	it('la fase de la campaña es la mínima de sus soportes', () => {
		expect(campaignStage([2, 2, 1, 3, 3, 1, 3, 0])).toBe(0);
		expect(campaignStage([], 4)).toBe(4);
	});

	it('el progreso se pondera por soporte (Lanzamiento Burgers = 31 %)', () => {
		expect(campaignProgress([2, 2, 1, 3, 3, 1, 3, 0])).toBe(31);
		expect(campaignProgress([6, 6])).toBe(100);
		expect(campaignProgress([])).toBe(0);
	});

	it('etiquetas y tonos de fase', () => {
		expect(stageLabel(5)).toBe('Expedida');
		expect(stageTone(6)).toBe('green');
		expect(stageLabel(0, true)).toBe('Planificada');
		expect(stageTone(0, true)).toBe('outline');
	});
});

describe('semáforo', () => {
	const base = {
		planned: false,
		openHighIncidents: 0,
		pendingVersions: 0,
		approvalDueOn: '2026-10-24',
		today: TODAY
	};

	it('gris si está planificada', () =>
		expect(semaphore({ ...base, planned: true, openHighIncidents: 2 })).toBe('gris'));
	it('rojo con una incidencia grave abierta', () =>
		expect(semaphore({ ...base, openHighIncidents: 1, pendingVersions: 3 })).toBe('rojo'));
	it('ámbar con versiones pendientes a 7 días o menos del límite', () => {
		expect(semaphore({ ...base, pendingVersions: 4 })).toBe('ambar');
		expect(semaphore({ ...base, pendingVersions: 4, approvalDueOn: '2026-10-29' })).toBe('ambar');
		expect(semaphore({ ...base, pendingVersions: 4, approvalDueOn: '2026-10-30' })).toBe('verde');
	});
	it('verde en el resto de casos', () => expect(semaphore(base)).toBe('verde'));
});

describe('fechas', () => {
	it('relativas como en el prototipo', () => {
		expect(relDays('2026-10-22', TODAY)).toBe('hoy');
		expect(relDays('2026-10-23', TODAY)).toBe('mañana');
		expect(relDays('2026-10-21', TODAY)).toBe('ayer');
		expect(relDays('2026-10-26', TODAY)).toBe('en 4 días');
		expect(relDays('2026-10-06', TODAY)).toBe('hace 16 días');
		expect(daysBetween('2026-10-22', '2027-02-09')).toBe(110);
		expect(fmtDay('2026-10-06')).toBe('06/10/2026');
	});
});

describe('paridad con el prototipo (scripts/data/prototype.json)', () => {
	const proto = JSON.parse(readFileSync('scripts/data/prototype.json', 'utf8')) as {
		campaigns: {
			id: string;
			enRte: string;
			stage: number;
			progress: number;
			dates: Record<string, string>;
			supports: { stage: number }[];
		}[];
	};
	const keyMap: Record<string, string> = { prodIni: 'prod_ini', prodFin: 'prod_fin' };

	it.each(proto.campaigns.map((c) => [c.id, c] as const))(
		'%s: fase, progreso e hitos coinciden',
		(_id, c) => {
			const stages = c.supports.map((s) => s.stage);
			expect(campaignStage(stages)).toBe(c.stage);
			expect(campaignProgress(stages)).toBe(c.progress);
			const ours = milestonesFor(c.enRte) as Record<string, string>;
			for (const [k, v] of Object.entries(c.dates)) expect(ours[keyMap[k] ?? k]).toBe(v);
		}
	);
});
