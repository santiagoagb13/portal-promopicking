/**
 * Informes (8.9). Cada mes sale de una de dos fuentes:
 * - el portal (kits, tickets, pedidos y aprobaciones) desde el mes del primer escaneo de un kit;
 * - el histórico (`report_history`) para los meses anteriores, cargado de las hojas de seguimiento.
 * La página, los CSV y el PDF llaman a `reportData`, así que siempre cuentan lo mismo.
 */
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import {
	BRAND_SLOT,
	businessDays,
	monthEnd,
	monthsFor,
	pct,
	type Period
} from '$lib/domain/reports';
import { can, visibleBrands, type Actor } from '$lib/permissions';
import { db, tables } from '../db';
import { getSettings } from './settings';

const {
	brands,
	campaigns,
	kits,
	kitLines,
	tickets,
	restaurants,
	orders,
	orderLines,
	supports,
	supportVersions,
	reportHistory,
	reportHistoryIncidents
} = tables;

export class ReportError extends Error {}

export type MonthRow = {
	month: string;
	parcels: number;
	parcelsOk: number;
	incidents: number;
	pieces: number;
	orders: number;
	orderCents: number;
	approvals: number;
	approvalDays: number;
};
type BrandMonth = MonthRow & { brandCode: string };

const empty = (month: string, brandCode: string): BrandMonth => ({
	month,
	brandCode,
	parcels: 0,
	parcelsOk: 0,
	incidents: 0,
	pieces: 0,
	orders: 0,
	orderCents: 0,
	approvals: 0,
	approvalDays: 0
});

const MADRID = 'Europe/Madrid';
// Literal y no parámetro: Postgres solo agrupa por expresiones idénticas, y cada `$n` es otra.
const TZ = sql.raw(`'${MADRID}'`);
const monthOf = (col: unknown) => sql<string>`to_char(${col} at time zone ${TZ}, 'YYYY-MM')`;

/**
 * Primer mes que mide el portal: el de la primera campaña con kits generados en él. Antes de ese
 * mes, el histórico; desde él, los datos vivos (o el mes actual si aún no hay kits).
 */
export async function liveFrom(today: string): Promise<string> {
	const [r] = await db
		.select({ m: sql<string | null>`to_char(min(${campaigns.inRestaurantOn}), 'YYYY-MM')` })
		.from(campaigns)
		.where(sql`exists (select 1 from ${kits} k where k.campaign_id = ${campaigns.id})`);
	return r?.m ?? today.slice(0, 7);
}

/** Datos del informe para el actor (su ámbito de marcas), una marca y un periodo. */
export async function reportData(
	actor: Actor,
	opts: { brand?: string | null; period: Period; today: string }
) {
	if (!can(actor, 'report.view')) throw new ReportError('Sin acceso a informes');
	const allBrands = await db.select().from(brands).orderBy(asc(brands.code));
	const scope = visibleBrands(actor) ?? allBrands.map((b) => b.code);
	if (opts.brand && !scope.includes(opts.brand)) throw new ReportError('Marca no disponible');
	const codes = opts.brand ? [opts.brand] : scope;
	const months = monthsFor(opts.period, opts.today);
	const first = months[0]!;
	const last = months.at(-1)!;
	const from = await liveFrom(opts.today);
	const histMonths = months.filter((m) => m < from);
	const liveMonths = months.filter((m) => m >= from);
	const start = `${first}-01`;
	const end = monthEnd(last);
	const liveStart = liveMonths.length ? `${liveMonths[0]}-01` : null;
	const settings = await getSettings();

	const cell = new Map<string, BrandMonth>();
	const at = (m: string, b: string) => {
		const k = `${m}|${b}`;
		let r = cell.get(k);
		if (!r) cell.set(k, (r = empty(m, b)));
		return r;
	};
	const kinds = new Map<string, number>();
	const addKind = (k: string, n: number) => kinds.set(k, (kinds.get(k) ?? 0) + n);
	const codesOrNone = codes.length ? codes : [''];

	if (histMonths.length) {
		const [rows, inc] = await Promise.all([
			db
				.select()
				.from(reportHistory)
				.where(
					and(
						inArray(reportHistory.month, histMonths),
						inArray(reportHistory.brandCode, codesOrNone)
					)
				),
			db
				.select()
				.from(reportHistoryIncidents)
				.where(
					and(
						inArray(reportHistoryIncidents.month, histMonths),
						inArray(reportHistoryIncidents.brandCode, codesOrNone)
					)
				)
		]);
		for (const r of rows) Object.assign(at(r.month, r.brandCode), r);
		for (const r of inc) addKind(r.kind, r.n);
	}

	let topRestaurants: {
		id: string;
		name: string;
		brandCode: string;
		orders: number;
		cents: number;
	}[] = [];
	if (liveStart) {
		const liveEnd = end;
		const due = sql`(${kits.state} = 4 or ${campaigns.inRestaurantOn} <= ${opts.today})`;
		const onTime = sql`(${kits.state} = 4 and (${kits.receivedAt} at time zone ${TZ})::date <= ${campaigns.inRestaurantOn} and ${kits.incidentTicketId} is null)`;
		const campMonth = sql<string>`to_char(${campaigns.inRestaurantOn}, 'YYYY-MM')`;
		const ticketBrand = sql<string>`coalesce(${campaigns.brandCode}, ${restaurants.brandCode})`;
		const [kitRows, pieceRows, incRows, orderRows, approvalRows, restRows] = await Promise.all([
			db
				.select({
					m: campMonth,
					b: campaigns.brandCode,
					parcels: sql<number>`coalesce(sum(${kits.parcels}) filter (where ${due}), 0)::int`,
					ok: sql<number>`coalesce(sum(${kits.parcels}) filter (where ${onTime}), 0)::int`
				})
				.from(kits)
				.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
				.where(
					and(
						gte(campaigns.inRestaurantOn, liveStart),
						lte(campaigns.inRestaurantOn, liveEnd),
						inArray(campaigns.brandCode, codesOrNone)
					)
				)
				.groupBy(campMonth, campaigns.brandCode),
			db
				.select({
					m: campMonth,
					b: campaigns.brandCode,
					n: sql<number>`coalesce(sum(${kitLines.qty}), 0)::int`
				})
				.from(kitLines)
				.innerJoin(kits, eq(kits.id, kitLines.kitId))
				.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
				.where(
					and(
						eq(kits.state, 4),
						gte(campaigns.inRestaurantOn, liveStart),
						lte(campaigns.inRestaurantOn, liveEnd),
						inArray(campaigns.brandCode, codesOrNone)
					)
				)
				.groupBy(campMonth, campaigns.brandCode),
			db
				.select({
					m: monthOf(tickets.openedAt),
					b: ticketBrand,
					kind: tickets.kind,
					n: sql<number>`count(*)::int`
				})
				.from(tickets)
				.leftJoin(campaigns, eq(campaigns.id, tickets.campaignId))
				.leftJoin(restaurants, eq(restaurants.id, tickets.restaurantId))
				.where(
					and(
						eq(tickets.type, 'incident'),
						gte(monthOf(tickets.openedAt), liveMonths[0]!),
						lte(monthOf(tickets.openedAt), last),
						inArray(ticketBrand, codesOrNone)
					)
				)
				.groupBy(monthOf(tickets.openedAt), ticketBrand, tickets.kind),
			db
				.select({
					m: monthOf(orders.placedAt),
					b: restaurants.brandCode,
					n: sql<number>`count(distinct ${orders.id})::int`,
					cents: sql<number>`coalesce(sum(${orderLines.qty} * ${orderLines.unitPriceCents}), 0)::int`
				})
				.from(orders)
				.innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
				.leftJoin(orderLines, eq(orderLines.orderId, orders.id))
				.where(
					and(
						ne(orders.state, 'cancelled'),
						gte(monthOf(orders.placedAt), liveMonths[0]!),
						lte(monthOf(orders.placedAt), last),
						inArray(restaurants.brandCode, codesOrNone)
					)
				)
				.groupBy(monthOf(orders.placedAt), restaurants.brandCode),
			db
				.select({
					b: campaigns.brandCode,
					up: supportVersions.uploadedAt,
					dec: supportVersions.decidedAt
				})
				.from(supportVersions)
				.innerJoin(supports, eq(supports.id, supportVersions.supportId))
				.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
				.where(
					and(
						eq(supportVersions.status, 'approved'),
						isNotNull(supportVersions.uploadedAt),
						gte(monthOf(supportVersions.decidedAt), liveMonths[0]!),
						lte(monthOf(supportVersions.decidedAt), last),
						inArray(campaigns.brandCode, codesOrNone)
					)
				),
			db
				.select({
					id: restaurants.id,
					name: restaurants.name,
					brandCode: restaurants.brandCode,
					orders: sql<number>`count(distinct ${orders.id})::int`,
					cents: sql<number>`coalesce(sum(${orderLines.qty} * ${orderLines.unitPriceCents}), 0)::int`
				})
				.from(orders)
				.innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
				.leftJoin(orderLines, eq(orderLines.orderId, orders.id))
				.where(
					and(
						ne(orders.state, 'cancelled'),
						gte(monthOf(orders.placedAt), liveMonths[0]!),
						lte(monthOf(orders.placedAt), last),
						inArray(restaurants.brandCode, codesOrNone)
					)
				)
				.groupBy(restaurants.id, restaurants.name, restaurants.brandCode)
				.orderBy(sql`count(distinct ${orders.id}) desc`, asc(restaurants.name))
				.limit(5)
		]);
		for (const r of kitRows) Object.assign(at(r.m, r.b), { parcels: r.parcels, parcelsOk: r.ok });
		for (const r of pieceRows) at(r.m, r.b).pieces = r.n;
		for (const r of incRows) {
			at(r.m, r.b).incidents += r.n;
			addKind(r.kind, r.n);
		}
		for (const r of orderRows) Object.assign(at(r.m, r.b), { orders: r.n, orderCents: r.cents });
		for (const r of approvalRows) {
			const c = at(r.dec ? monthOfDate(r.dec) : last, r.b);
			c.approvals += 1;
			c.approvalDays += businessDays(r.up!, r.dec!);
		}
		topRestaurants = restRows;
	}

	const rows = [...cell.values()].filter((r) => months.includes(r.month));
	const sum = (rs: MonthRow[], k: keyof Omit<MonthRow, 'month'>) =>
		rs.reduce((n, r) => n + r[k], 0);
	const byMonth: MonthRow[] = months.map((m) => {
		const rs = rows.filter((r) => r.month === m);
		return {
			month: m,
			parcels: sum(rs, 'parcels'),
			parcelsOk: sum(rs, 'parcelsOk'),
			incidents: sum(rs, 'incidents'),
			pieces: sum(rs, 'pieces'),
			orders: sum(rs, 'orders'),
			orderCents: sum(rs, 'orderCents'),
			approvals: sum(rs, 'approvals'),
			approvalDays: sum(rs, 'approvalDays')
		};
	});
	// Orden fijo de la paleta (FH, VIPS, Ginos): el color sigue a la marca, no a su posición.
	const shown = allBrands
		.filter((b) => codes.includes(b.code))
		.sort((a, b) => (BRAND_SLOT[a.code] ?? 9) - (BRAND_SLOT[b.code] ?? 9));
	const byBrand = shown.map((b) => {
		const rs = rows.filter((r) => r.brandCode === b.code);
		return {
			code: b.code,
			name: b.name,
			short: b.short,
			pieces: months.map((m) => rs.find((r) => r.month === m)?.pieces ?? 0),
			approvals: sum(rs, 'approvals'),
			approvalAvg: sum(rs, 'approvals') ? sum(rs, 'approvalDays') / sum(rs, 'approvals') : null
		};
	});

	const topSupports = await db
		.select({
			name: supports.name,
			brandCode: campaigns.brandCode,
			pieces: sql<number>`sum(${supports.runQty})::int`
		})
		.from(supports)
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.where(
			and(
				gte(campaigns.inRestaurantOn, start),
				lte(campaigns.inRestaurantOn, end),
				lt(campaigns.inRestaurantOn, sql`${opts.today}::date + 1`),
				inArray(campaigns.brandCode, codesOrNone)
			)
		)
		.groupBy(supports.name, campaigns.brandCode)
		.orderBy(sql`sum(${supports.runQty}) desc`)
		.limit(10);

	const totals = {
		parcels: sum(byMonth, 'parcels'),
		parcelsOk: sum(byMonth, 'parcelsOk'),
		incidents: sum(byMonth, 'incidents'),
		pieces: sum(byMonth, 'pieces'),
		orders: sum(byMonth, 'orders'),
		orderCents: sum(byMonth, 'orderCents'),
		approvals: sum(byMonth, 'approvals'),
		approvalDays: sum(byMonth, 'approvalDays')
	};
	return {
		brand: opts.brand ?? null,
		brands: allBrands.filter((b) => scope.includes(b.code)),
		period: opts.period,
		months,
		liveFrom: from,
		histUntil: histMonths.at(-1) ?? null,
		otifTarget: settings.otifTarget,
		byMonth: byMonth.map((r) => ({ ...r, otif: pct(r.parcelsOk, r.parcels) })),
		byBrand,
		incidentsByKind: [...kinds.entries()]
			.map(([kind, n]) => ({ kind, n }))
			.sort((a, b) => b.n - a.n),
		topSupports,
		topRestaurants,
		kpis: {
			otif: pct(totals.parcelsOk, totals.parcels),
			incidentRate: pct(totals.incidents, totals.parcels),
			incidents: totals.incidents,
			parcels: totals.parcels,
			pieces: totals.pieces,
			orders: totals.orders,
			orderCents: totals.orderCents,
			approvalAvg: totals.approvals ? totals.approvalDays / totals.approvals : null
		}
	};
}

export type ReportData = Awaited<ReturnType<typeof reportData>>;

function monthOfDate(d: Date): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID, year: 'numeric', month: '2-digit' })
		.format(d)
		.slice(0, 7);
}
