import { addDays, daysBetween } from './dates';

/** Fases de un soporte y de la campaña (la fase de la campaña es la mínima de sus soportes). */
export const STAGES = [
	'Brief recibido',
	'En adaptación',
	'En aprobación',
	'En producción',
	'En kitting',
	'Expedida',
	'Entregada'
] as const;
export const LAST_STAGE = STAGES.length - 1;

export type ChipTone = '' | 'green' | 'amber' | 'red' | 'primary' | 'info' | 'outline';

/** Tono del chip de fase en la propuesta B (maqueta `b-lamina-campanas.html`). */
export const STAGE_TONE: ChipTone[] = ['', '', 'amber', 'primary', 'primary', 'info', 'green'];

export function stageLabel(stage: number, planned = false): string {
	return planned ? 'Planificada' : (STAGES[Math.min(Math.max(stage, 0), LAST_STAGE)] ?? STAGES[0]);
}

export function stageTone(stage: number, planned = false): ChipTone {
	return planned ? 'outline' : (STAGE_TONE[Math.min(Math.max(stage, 0), LAST_STAGE)] ?? '');
}

export const MILESTONE_KEYS = [
	'brief',
	'af',
	'aprob',
	'prod_ini',
	'prod_fin',
	'kitting',
	'exped',
	'plataforma',
	'rte'
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export const MILESTONE_LABEL: Record<MilestoneKey, string> = {
	brief: 'Brief recibido',
	af: 'Entrega de artes finales',
	aprob: 'Límite de aprobación',
	prod_ini: 'Inicio de producción',
	prod_fin: 'Fin de producción',
	kitting: 'Kitting por restaurante',
	exped: 'Expedición',
	plataforma: 'Entrega en plataforma Promopicking',
	rte: 'En restaurante'
};

/**
 * Días antes de la fecha en restaurante de cada hito: la misma regla que `calDates()` del
 * prototipo. En la fase 2 serán plazos por defecto editables en Administración › Ajustes.
 */
export const MILESTONE_OFFSETS: Record<MilestoneKey, number> = {
	brief: -40,
	af: -26,
	aprob: -19,
	prod_ini: -18,
	prod_fin: -10,
	kitting: -9,
	exped: -7,
	plataforma: -5,
	rte: 0
};

/** Hitos de una campaña calculados hacia atrás desde la fecha en restaurante. */
export function milestonesFor(inRestaurantOn: string): Record<MilestoneKey, string> {
	return Object.fromEntries(
		MILESTONE_KEYS.map((k) => [k, addDays(inRestaurantOn, MILESTONE_OFFSETS[k])])
	) as Record<MilestoneKey, string>;
}

/** Hito que cierra cada fase (índice = fase), como `STAGE_DATE_KEY` del prototipo. */
export const STAGE_MILESTONE: MilestoneKey[] = ['brief', 'af', 'aprob', 'prod_fin', 'kitting', 'exped', 'rte'];

/** ¿Está hecho el hito, según la fase actual de la campaña y la fecha de hoy? */
export function milestoneDone(key: MilestoneKey, stage: number, dueOn: string, today: string): boolean {
	const idx = STAGE_MILESTONE.indexOf(key);
	if (idx >= 0) return stage > idx || stage === LAST_STAGE;
	return daysBetween(today, dueOn) < 0;
}

export function campaignStage(supportStages: number[], fallback = 0): number {
	return supportStages.length ? Math.min(...supportStages) : fallback;
}

/** Progreso ponderado por soporte: suma de fases / (6 × soportes), en %. */
export function campaignProgress(supportStages: number[]): number {
	if (!supportStages.length) return 0;
	const sum = supportStages.reduce((a, s) => a + s, 0);
	return Math.round((sum / (LAST_STAGE * supportStages.length)) * 100);
}

export type Semaphore = 'verde' | 'ambar' | 'rojo' | 'gris';

export const SEMAPHORE_REASON: Record<Semaphore, string> = {
	verde: 'En plazo',
	ambar: 'Riesgo de plazo: aprobaciones pendientes',
	rojo: 'Incidencia abierta',
	gris: 'Planificada'
};

/** Orden de gravedad para ordenar por semáforo (rojo primero). */
export const SEMAPHORE_RANK: Record<Semaphore, number> = { rojo: 0, ambar: 1, verde: 2, gris: 3 };

/** Días antes del límite de aprobación a partir de los cuales las versiones pendientes son un riesgo. */
export const APPROVAL_RISK_DAYS = 7;

export function semaphore(p: {
	planned: boolean;
	openHighIncidents: number;
	pendingVersions: number;
	approvalDueOn: string;
	today: string;
}): Semaphore {
	if (p.planned) return 'gris';
	if (p.openHighIncidents > 0) return 'rojo';
	if (p.pendingVersions > 0 && daysBetween(p.today, p.approvalDueOn) <= APPROVAL_RISK_DAYS) return 'ambar';
	return 'verde';
}
