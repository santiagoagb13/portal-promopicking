import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { SEMAPHORE_RANK } from '$lib/domain/campaign';
import { daysBetween, todayDay } from '$lib/domain/dates';
import { can } from '$lib/permissions';
import { config } from '$lib/server/config';
import { db, tables } from '$lib/server/db';
import { brandsFor, listCampaigns } from '$lib/server/services/campaigns';
import type { PageServerLoad } from './$types';

const { tickets } = tables;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:campanas');
	const actor = locals.user!;
	const today = todayDay(config.referenceDate);
	const brands = await brandsFor(actor);
	const brandParam = url.searchParams.get('marca')?.toUpperCase();
	const brand = brands.some((b) => b.code === brandParam) ? brandParam : undefined;
	const q = url.searchParams.get('q')?.trim().slice(0, 80) || undefined;
	const order = url.searchParams.get('orden') === 'semaforo' ? 'semaforo' : 'fecha';
	const desc = url.searchParams.get('dir') === 'desc';

	const scoped = await listCampaigns(actor, { brand, today });
	const rows = q
		? scoped.filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(q.toLowerCase()))
		: [...scoped];
	rows.sort((a, b) => {
		const byDate = a.inRestaurantOn.localeCompare(b.inRestaurantOn) || a.id.localeCompare(b.id);
		const primary = order === 'semaforo' ? SEMAPHORE_RANK[a.semaphore] - SEMAPHORE_RANK[b.semaphore] : 0;
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
				.where(and(inArray(tickets.campaignId, ids), eq(tickets.type, 'incident'), ne(tickets.state, 'closed')))
		: [{ n: 0 }];
	const next = scoped
		.filter((c) => daysBetween(today, c.inRestaurantOn) >= 0)
		.sort((a, b) => a.inRestaurantOn.localeCompare(b.inRestaurantOn))[0];

	return {
		title: 'Campañas',
		today,
		brands: brands.map((b) => ({ code: b.code, label: b.name.split(' ')[0] ?? b.short })),
		brand: brand ?? null,
		q: q ?? '',
		order,
		desc,
		expanded: url.searchParams.has('todas'),
		rows,
		kpis: {
			active,
			total: scoped.length,
			pending,
			incidents: incidents?.n ?? 0,
			next: next ? { id: next.id, name: next.name, on: next.inRestaurantOn } : null
		},
		canCreate: can(actor, 'campaign.create'),
		canSeeApprovals: can(actor, 'artwork.view')
	};
};
