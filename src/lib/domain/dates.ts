/** Fechas de calendario sin hora (`YYYY-MM-DD`), en hora local, como en el prototipo. */

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDay(s: string): Date {
	const [y, m, d] = s.slice(0, 10).split('-').map(Number) as [number, number, number];
	return new Date(y, m - 1, d);
}

export function ymd(dt: Date): string {
	return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function addDays(day: string, n: number): string {
	const dt = parseDay(day);
	dt.setDate(dt.getDate() + n);
	return ymd(dt);
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: string, to: string): number {
	return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export function relDays(day: string, today: string): string {
	const n = daysBetween(today, day);
	if (n === 0) return 'hoy';
	if (n === 1) return 'mañana';
	if (n === -1) return 'ayer';
	return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/** 06/10/2026 */
export function fmtDay(day: string | null | undefined): string {
	if (!day) return '—';
	const [y, m, d] = day.slice(0, 10).split('-');
	return `${d}/${m}/${y}`;
}

/** 06/10 */
export function fmtDayShort(day: string): string {
	const [, m, d] = day.slice(0, 10).split('-');
	return `${d}/${m}`;
}

/** 21/10/2026 17:40 en hora de Madrid. */
export function fmtDateTime(dt: Date | string | null | undefined): string {
	if (!dt) return '—';
	const d = typeof dt === 'string' ? new Date(dt) : dt;
	return new Intl.DateTimeFormat('es-ES', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Madrid'
	})
		.format(d)
		.replace(',', '');
}

/** Hoy (`YYYY-MM-DD`): la fecha de referencia de los datos de prueba si está fijada, si no la real. */
export function todayDay(reference?: string): string {
	return reference ? reference.slice(0, 10) : ymd(new Date());
}
