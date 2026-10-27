import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import {
	campaignProgress,
	campaignStage,
	milestonesFor,
	semaphore,
	stageLabel,
	stageTone,
	type ChipTone,
	type Semaphore
} from '$lib/domain/campaign';
import { managerBrands, type Actor } from '$lib/permissions';
import { db, tables } from '../db';

const { campaigns, brands, supports, supportVersions, tickets, kits, campaignMilestones } = tables;

/**
 * Ámbito de campañas (4.2): marca → sus marcas; gerente → campañas de la marca de su restaurante
 * que le afectan (si ya hay kits, solo si uno es para su restaurante). Internos: todas.
 */
export function campaignScope(actor: Actor): SQL | undefined {
	if (actor.role === 'brand')
		return actor.brands.length ? inArray(campaigns.brandCode, actor.brands) : sql`false`;
	if (actor.role === 'manager') {
		const mine = actor.restaurants.map((r) => r.id);
		const brandsOfMine = managerBrands(actor);
		if (!mine.length) return sql`false`;
		return and(
			inArray(campaigns.brandCode, brandsOfMine),
			sql`(not exists (select 1 from ${kits} k where k.campaign_id = ${campaigns.id})
				or exists (select 1 from ${kits} k where k.campaign_id = ${campaigns.id} and k.restaurant_id in ${mine}))`
		);
	}
	return undefined;
}

export type CampaignRow = {
	id: string;
	name: string;
	brandCode: string;
	brandShort: string;
	inRestaurantOn: string;
	restaurantCount: number;
	planned: boolean;
	stage: number;
	stageLabel: string;
	stageTone: ChipTone;
	progress: number;
	semaphore: Semaphore;
	pendingVersions: number;
	openIncidents: number;
};

/** Campañas visibles para el actor, con fase, progreso y semáforo calculados. */
export async function listCampaigns(
	actor: Actor,
	opts: { brand?: string; q?: string; today: string; id?: string }
): Promise<CampaignRow[]> {
	const where = and(
		campaignScope(actor),
		opts.brand ? eq(campaigns.brandCode, opts.brand) : undefined,
		opts.id ? eq(campaigns.id, opts.id) : undefined,
		opts.q
			? sql`(${campaigns.name} ilike ${'%' + opts.q + '%'} or ${campaigns.id} ilike ${'%' + opts.q + '%'})`
			: undefined
	);
	const rows = await db
		.select({
			id: campaigns.id,
			name: campaigns.name,
			brandCode: campaigns.brandCode,
			brandShort: brands.short,
			inRestaurantOn: campaigns.inRestaurantOn,
			restaurantCount: campaigns.restaurantCount,
			planned: campaigns.planned
		})
		.from(campaigns)
		.innerJoin(brands, eq(brands.code, campaigns.brandCode))
		.where(where)
		.orderBy(asc(campaigns.inRestaurantOn), asc(campaigns.id));
	if (!rows.length) return [];
	const ids = rows.map((r) => r.id);

	const [stages, pending, incidents, aprob] = await Promise.all([
		db
			.select({ campaignId: supports.campaignId, stage: supports.stage })
			.from(supports)
			.where(inArray(supports.campaignId, ids)),
		db
			.select({ campaignId: supports.campaignId, n: sql<number>`count(*)::int` })
			.from(supportVersions)
			.innerJoin(supports, eq(supports.id, supportVersions.supportId))
			.where(and(inArray(supports.campaignId, ids), ne(supportVersions.status, 'approved')))
			.groupBy(supports.campaignId),
		db
			.select({
				campaignId: tickets.campaignId,
				open: sql<number>`count(*)::int`,
				high: sql<number>`count(*) filter (where ${tickets.severity} = 'high')::int`
			})
			.from(tickets)
			.where(
				and(
					inArray(tickets.campaignId, ids),
					eq(tickets.type, 'incident'),
					ne(tickets.state, 'closed')
				)
			)
			.groupBy(tickets.campaignId),
		db
			.select({ campaignId: campaignMilestones.campaignId, dueOn: campaignMilestones.dueOn })
			.from(campaignMilestones)
			.where(and(inArray(campaignMilestones.campaignId, ids), eq(campaignMilestones.key, 'aprob')))
	]);

	const stagesBy = new Map<string, number[]>();
	for (const s of stages)
		stagesBy.set(s.campaignId, [...(stagesBy.get(s.campaignId) ?? []), s.stage]);
	const pendingBy = new Map(pending.map((p) => [p.campaignId, p.n]));
	const incidentsBy = new Map(incidents.map((i) => [i.campaignId!, i]));
	const aprobBy = new Map(aprob.map((a) => [a.campaignId, a.dueOn]));

	return rows.map((r) => {
		const st = stagesBy.get(r.id) ?? [];
		const stage = campaignStage(st);
		const inc = incidentsBy.get(r.id);
		const pendingVersions = pendingBy.get(r.id) ?? 0;
		return {
			...r,
			stage,
			stageLabel: stageLabel(stage, r.planned),
			stageTone: stageTone(stage, r.planned),
			progress: campaignProgress(st),
			pendingVersions,
			openIncidents: inc?.open ?? 0,
			semaphore: semaphore({
				planned: r.planned,
				openHighIncidents: inc?.high ?? 0,
				pendingVersions,
				approvalDueOn: aprobBy.get(r.id) ?? milestonesFor(r.inRestaurantOn).aprob,
				today: opts.today
			})
		};
	});
}

export async function getCampaignDetail(actor: Actor, id: string, today: string) {
	const [row] = await listCampaigns(actor, { id, today });
	if (!row) return null;
	const [milestones, sups] = await Promise.all([
		db
			.select()
			.from(campaignMilestones)
			.where(eq(campaignMilestones.campaignId, id))
			.orderBy(asc(campaignMilestones.dueOn)),
		db
			.select({
				id: supports.id,
				name: supports.name,
				versionsPlanned: supports.versionsPlanned,
				runQty: supports.runQty,
				packaging: supports.packaging,
				stage: supports.stage,
				responsible: supports.responsible
			})
			.from(supports)
			.where(eq(supports.campaignId, id))
			.orderBy(asc(supports.position))
	]);
	return { campaign: row, milestones, supports: sups };
}

/** Marcas que el actor puede filtrar en el panel. */
export async function brandsFor(actor: Actor) {
	const all = await db.select().from(brands).orderBy(desc(brands.restaurantCount));
	if (actor.role === 'brand') return all.filter((b) => actor.brands.includes(b.code));
	if (actor.role === 'manager') return all.filter((b) => managerBrands(actor).includes(b.code));
	return all;
}
