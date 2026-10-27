import type { ChipTone } from './campaign';
import { codeKey } from './artwork';

/** Estados del kit (2.2): 0 preparado → 4 recibido. */
export const KIT_STATES = [
	'Preparado',
	'Expedido',
	'En plataforma',
	'En reparto',
	'Recibido'
] as const;
export const KIT_TONE: ChipTone[] = ['', 'info', 'primary', 'amber', 'green'];

export type ScanStep = 'shipped' | 'hub_in' | 'out_for_delivery';
export const SCAN_STEPS: ScanStep[] = ['shipped', 'hub_in', 'out_for_delivery'];
export const STEP_STATE: Record<ScanStep, number> = { shipped: 1, hub_in: 2, out_for_delivery: 3 };
export const STEP_LABEL: Record<ScanStep, string> = {
	shipped: 'Expedición',
	hub_in: 'Entrada en plataforma',
	out_for_delivery: 'Salida a reparto'
};

export type KitEventType =
	'prepared' | 'shipped' | 'hub_in' | 'out_for_delivery' | 'received' | 'incident';
export const EVENT_LABEL: Record<KitEventType, string> = {
	prepared: 'Kit preparado y etiquetado',
	shipped: 'Salida de producción (expedición)',
	hub_in: 'Entrada en plataforma Promopicking',
	out_for_delivery: 'Salida a reparto',
	received: 'Recepción en restaurante',
	incident: 'Incidencia'
};

export const INCIDENT_KINDS = [
	'Faltan unidades',
	'Bulto dañado',
	'Retraso de transporte',
	'Versión incorrecta',
	'Otros'
] as const;

export function nextStep(state: number): ScanStep | null {
	return SCAN_STEPS.find((s) => STEP_STATE[s] === state + 1) ?? null;
}

/**
 * ¿Se puede registrar este paso? Solo el siguiente al estado actual. Si el kit ya está en ese
 * paso o más allá (otro dispositivo, o la cola sin conexión que reenvía), no es un error: ya consta.
 */
export function checkScan(
	state: number,
	step: ScanStep
): { ok: true; already: boolean } | { ok: false; message: string } {
	const target = STEP_STATE[step];
	if (state >= target) return { ok: true, already: true };
	if (state === target - 1) return { ok: true, already: false };
	return { ok: false, message: `Falta registrar «${STEP_LABEL[nextStep(state)!]}» antes` };
}

/** `K-FH2609-0147` a partir de la campaña y el restaurante (formato del prototipo). */
export function kitIdFor(campaignId: string, restaurantId: string): string {
	return `K-${campaignId.replace(/-/g, '').toUpperCase()}-${restaurantId.split('-')[1]}`;
}

/** Lee el kit (y el bulto) de lo que da el lector: el id suelto, `K-…/2` o la URL del QR de la etiqueta. */
export function parseKitCode(text: string): { kitId: string; parcel: number | null } | null {
	const m = text
		.trim()
		.toUpperCase()
		.match(/(K-[A-Z0-9]+-\d{4})(?:[/?#](?:B=)?(\d{1,2}))?/);
	if (!m) return null;
	return { kitId: m[1]!, parcel: m[2] ? Number(m[2]) : null };
}

/** Contenido de la etiqueta del bulto `n` de `total`, para el QR: URL del portal al kit. */
export function labelUrl(origin: string, kitId: string, parcel: number): string {
	return `${origin}/k/${kitId}/${parcel}`;
}

/**
 * Versión de un soporte que recibe un restaurante: la que coincide con su tarifa, surtido e
 * idioma (el idioma del maestro puede ser compuesto, «SP + EN»: cuenta el primero). Si el soporte
 * solo tiene una versión, esa; si no hay coincidencia, se compone el código con los datos del maestro.
 */
export function versionFor(
	r: { tariff: string; assortment: string; language: string },
	versions: {
		code: string;
		tariff: string | null;
		assortment: string | null;
		language: string | null;
	}[]
): string {
	const lang = r.language.split('+')[0]!.trim().toUpperCase();
	const exact = versions.find(
		(v) =>
			v.tariff?.toUpperCase() === r.tariff.toUpperCase() &&
			(v.assortment === null || v.assortment.toUpperCase() === r.assortment.toUpperCase()) &&
			v.language?.toUpperCase() === lang
	);
	if (exact) return exact.code;
	const byLang = versions.filter((v) => v.language?.toUpperCase() === lang);
	if (byLang.length === 1) return byLang[0]!.code;
	if (versions.length === 1) return versions[0]!.code;
	const composed = [
		r.tariff,
		['ALL', 'COMPLETA'].includes(r.assortment.toUpperCase()) ? '' : r.assortment,
		lang
	]
		.filter(Boolean)
		.join(' ');
	return versions.find((v) => codeKey(v.code) === codeKey(composed))?.code ?? composed;
}
