/** Soporte e incidencias (8.11): etiquetas y tonos compartidos por servidor y cliente. */
import type { ChipTone } from './campaign';
export { INCIDENT_KINDS } from './kits';

export const TICKET_TYPES = ['incident', 'query'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
	incident: 'Incidencia',
	query: 'Consulta'
};
export const TICKET_TYPE_TONE: Record<TicketType, ChipTone> = { incident: 'red', query: 'info' };

export const TICKET_STATES = ['open', 'in_progress', 'answered', 'closed'] as const;
export type TicketState = (typeof TICKET_STATES)[number];
export const TICKET_STATE_LABEL: Record<TicketState, string> = {
	open: 'Abierta',
	in_progress: 'En curso',
	answered: 'Respondida',
	closed: 'Cerrada'
};
export const TICKET_STATE_TONE: Record<TicketState, ChipTone> = {
	open: 'amber',
	in_progress: 'primary',
	answered: 'info',
	closed: 'green'
};

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = {
	low: 'Baja',
	medium: 'Media',
	high: 'Alta'
};
export const SEVERITY_TONE: Record<Severity, ChipTone> = { low: '', medium: 'amber', high: 'red' };

/** Motivos de consulta del prototipo («Versiones», «Medidas») más los habituales. */
export const QUERY_KINDS = ['Versiones', 'Medidas', 'Plazos', 'Precios', 'Otros'] as const;

/** Compromisos de respuesta del prototipo (tarjeta lateral de Soporte). */
export const RESPONSE_COMMITMENTS = [
	['Consulta', 'primera respuesta en 4 horas laborables.'],
	['Incidencia media', '(faltas, pequeños daños): reposición en 48 h.'],
	[
		'Incidencia alta',
		'(bulto dañado, versión incorrecta): reposición urgente en 24 h y aviso al responsable de Alsea.'
	]
] as const;

/** Título del registro a partir del texto: primera línea, como mucho 120 caracteres. */
export function titleFrom(text: string): string {
	const line = text.trim().split('\n')[0]!.trim();
	return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}
