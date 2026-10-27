import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { MILESTONE_LABEL, SEMAPHORE_RANK, STAGES } from '$lib/domain/campaign';
import { monthGrid } from '$lib/domain/calendar';
import { daysBetween, todayDay } from '$lib/domain/dates';
import { can } from '$lib/permissions';
import { config } from '$lib/server/config';
import { db, tables } from '$lib/server/db';
import {
	brandsFor,
	listCampaigns,
	milestonesOf,
	ownersByBrand
} from '$lib/server/services/campaigns';
import type { PageServerLoad } from './$types';

const { tickets } = tables;

/** Filtro de fase de la URL: 0–6 o «planificada». */
function parsePhase(v: string | null): number | 'planificada' | null {
	if (v === 'planificada') return v;
	const n = Number(v);
	return v !== null && v !== '' && Number.isInteger(n) && n >= 0 && n < STAGES.length ? n : null;
}

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:campanas');
	const actor = locals.user!;
	const today = todayDay(config.referenceDate);
	const sp = url.searchParams;
	const brands = await brandsFor(actor);
	const brandParam = sp.get('marca')?.toUpperCase();
	const brand = brands.some((b) => b.code === brandParam) ? brandParam : undefined;
	const q = sp.get('q')?.trim().slice(0, 80) || undefined;
	const phase = parsePhase(sp.get('fase'));
	const order = sp.get('orden') === 'semaforo' ? 'semaforo' : 'fecha';
	const desc = sp.get('dir') === 'desc';
	const view = sp.get('vista') === 'calendario' ? 'calendario' : 'tabla';
	const month = /^\d{4}-\d{2}$/.test(sp.get('mes') ?? '') ? sp.get('mes')! : today.slice(0, 7);

	const scoped = await listCampaigns(actor, { brand, today });
	const rows = scoped
		.filter((c) => !q || `${c.name} ${c.id}`.toLowerCase().includes(q.toLowerCase()))
		.filter(
			(c) =>
				phase === null || (phase === 'planificada' ? c.planned : !c.planned && c.stage === phase)
		);
	rows.sort((a, b) => {
		const byDate = a.inRestaurantOn.localeCompare(b.inRestaurantOn) || a.id.localeCompare(b.id);
		const primary =
			order === 'semaforo' ? SEMAPHORE_RANK[a.semaphore] - SEMAPHORE_RANK[b.semaphore] : 0;
		const r = primary || byDate;
		return desc ? -r : r;
	});

	// KPI (8.3) sobre las campañas visibles con el filtro de marca.
	const active = scoped.filter((c) => !c.planned && c.stage < 6).length;
	const pending = scoped.reduce((n, c) => n + c.pendingVersions, 0);
	const ids = scoped.map((c) => c.id);
	const [incidents] = ids.length
		? await db
				.select({ n: count() })
				.from(tickets)
				.where(
					and(
						inArray(tickets.campaignId, ids),
						eq(tickets.type, 'incident'),
						ne(tickets.state, 'closed')
					)
				)
		: [{ n: 0 }];
	const next = scoped
		.filter((c) => daysBetween(today, c.inRestaurantOn) >= 0)
		.sort((a, b) => a.inRestaurantOn.localeCompare(b.inRestaurantOn))[0];

	// Calendario (mes): los hitos de las campañas filtradas.
	let calendar = null;
	if (view === 'calendario') {
		const byId = new Map(rows.map((c) => [c.id, c]));
		const ms = await milestonesOf(rows.map((c) => c.id));
		const items = ms.map((m) => ({
			day: m.dueOn,
			campaignId: m.campaignId,
			name: byId.get(m.campaignId)!.name,
			brandShort: byId.get(m.campaignId)!.brandShort,
			label: MILESTONE_LABEL[m.key],
			key: m.key,
			done: !!m.doneAt
		}));
		calendar = { month, days: monthGrid(month, items) };
	}

	const canCreate = can(actor, 'campaign.create');
	return {
		title: 'Campañas',
		today,
		brands: brands.map((b) => ({
			code: b.code,
			label: b.name.split(' ')[0] ?? b.short,
			restaurantCount: b.restaurantCount
		})),
		brand: brand ?? null,
		q: q ?? '',
		phase,
		order,
		desc,
		view,
		calendar,
		expanded: sp.has('todas'),
		rows,
		kpis: {
			active,
			total: scoped.length,
			pending,
			incidents: incidents?.n ?? 0,
			next: next ? { id: next.id, name: next.name, on: next.inRestaurantOn } : null
		},
		canCreate,
		owners: canCreate ? await ownersByBrand() : [],
		canSeeApprovals: can(actor, 'artwork.view')
	};
};
