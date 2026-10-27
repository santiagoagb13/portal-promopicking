import { addDays, parseDay, ymd } from './dates';

export type CalendarDay<T> = { day: string; inMonth: boolean; items: T[] };

const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

export function monthLabel(month: string): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return `${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	const d = new Date(y, m - 1 + n, 1);
	return ymd(d).slice(0, 7);
}

/** Semanas completas (lunes a domingo) que cubren el mes, con los elementos de cada día. */
export function monthGrid<T extends { day: string }>(month: string, items: T[]): CalendarDay<T>[] {
	const first = parseDay(`${month}-01`);
	const offset = (first.getDay() + 6) % 7;
	const start = addDays(`${month}-01`, -offset);
	const next = shiftMonth(month, 1);
	const lastOfMonth = addDays(`${next}-01`, -1);
	const endOffset = 6 - ((parseDay(lastOfMonth).getDay() + 6) % 7);
	const end = addDays(lastOfMonth, endOffset);
	const byDay = new Map<string, T[]>();
	for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
	const days: CalendarDay<T>[] = [];
	for (let d = start; d <= end; d = addDays(d, 1))
		days.push({ day: d, inMonth: d.startsWith(month), items: byDay.get(d) ?? [] });
	return days;
}
