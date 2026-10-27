import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import {
	campaignProgress,
	campaignStage,
	MILESTONE_KEYS,
	milestoneDone,
	milestonesFor,
	nextCampaignId,
	semaphore,
	STAGE_MILESTONE,
	stageLabel,
	stageTone,
	type ChipTone,
	type MilestoneKey,
	type Semaphore
} from '$lib/domain/campaign';
import { managerBrands, can, type Actor } from '$lib/permissions';
import type { CampaignInput, SupportInput } from '$lib/schemas/campaign';
import { audit } from '../audit';
import { db, tables } from '../db';
import { getSettings } from './settings';

const {
	campaigns,
	brands,
	supports,
	supportVersions,
	tickets,
	kits,
	campaignMilestones,
	users,
	userBrands
} = tables;

type Meta = { ip?: string | null; userAgent?: string | null };

export class CampaignError extends Error {}

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
	archived: boolean;
	stage: number;
	stageLabel: string;
	stageTone: ChipTone;
	progress: number;
	semaphore: Semaphore;
	pendingVersions: number;
	openIncidents: number;
};

/** Campañas visibles para el actor, con fase, progreso y semáforo calculados. Sin las archivadas. */
export async function listCampaigns(
	actor: Actor,
	opts: { brand?: string; q?: string; today: string; id?: string; includeArchived?: boolean }
): Promise<CampaignRow[]> {
	const where = and(
		campaignScope(actor),
		opts.brand ? eq(campaigns.brandCode, opts.brand) : undefined,
		opts.id ? eq(campaigns.id, opts.id) : undefined,
		opts.includeArchived || opts.id ? undefined : isNull(campaigns.archivedAt),
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
			planned: campaigns.planned,
			archivedAt: campaigns.archivedAt
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

	return rows.map(({ archivedAt, ...r }) => {
		const st = stagesBy.get(r.id) ?? [];
		const stage = campaignStage(st);
		const inc = incidentsBy.get(r.id);
		const pendingVersions = pendingBy.get(r.id) ?? 0;
		return {
			...r,
			archived: !!archivedAt,
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

/** Hitos de varias campañas, para la vista de calendario. */
export async function milestonesOf(ids: string[]) {
	if (!ids.length) return [];
	return db
		.select({
			campaignId: campaignMilestones.campaignId,
			key: campaignMilestones.key,
			dueOn: campaignMilestones.dueOn,
			doneAt: campaignMilestones.doneAt
		})
		.from(campaignMilestones)
		.where(inArray(campaignMilestones.campaignId, ids))
		.orderBy(asc(campaignMilestones.dueOn));
}

export async function getCampaignDetail(actor: Actor, id: string, today: string) {
	const [row] = await listCampaigns(actor, { id, today });
	if (!row) return null;
	const [[base], milestones, sups, kitStates, ticketRows] = await Promise.all([
		db
			.select({
				materials: campaigns.materials,
				notes: campaigns.notes,
				ownerUserId: campaigns.ownerUserId,
				ownerName: users.name,
				templateOf: campaigns.templateOf,
				archivedAt: campaigns.archivedAt,
				updatedAt: campaigns.updatedAt
			})
			.from(campaigns)
			.leftJoin(users, eq(users.id, campaigns.ownerUserId))
			.where(eq(campaigns.id, id)),
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
				perKitQty: supports.perKitQty,
				packaging: supports.packaging,
				stage: supports.stage,
				responsible: supports.responsible,
				notes: supports.notes
			})
			.from(supports)
			.where(eq(supports.campaignId, id))
			.orderBy(asc(supports.position), asc(supports.name)),
		db
			.select({ state: kits.state, n: count() })
			.from(kits)
			.where(
				and(
					eq(kits.campaignId, id),
					actor.role === 'manager'
						? inArray(
								kits.restaurantId,
								actor.restaurants.map((r) => r.id)
							)
						: undefined
				)
			)
			.groupBy(kits.state),
		db
			.select({
				id: tickets.id,
				type: tickets.type,
				kind: tickets.kind,
				title: tickets.title,
				state: tickets.state,
				severity: tickets.severity,
				openedAt: tickets.openedAt
			})
			.from(tickets)
			.where(eq(tickets.campaignId, id))
			.orderBy(desc(tickets.openedAt))
	]);
	const versionCounts = sups.length
		? await db
				.select({
					supportId: supportVersions.supportId,
					versions: sql<number>`count(*)::int`,
					pending: sql<number>`count(*) filter (where ${supportVersions.status} <> 'approved')::int`
				})
				.from(supportVersions)
				.where(
					inArray(
						supportVersions.supportId,
						sups.map((x) => x.id)
					)
				)
				.groupBy(supportVersions.supportId)
		: [];
	const countsBy = new Map(versionCounts.map((v) => [v.supportId, v]));
	const due = Object.fromEntries(milestones.map((m) => [m.key, m.dueOn])) as Record<
		MilestoneKey,
		string
	>;
	return {
		campaign: { ...row, ...base! },
		milestones: milestones.map((m) => ({
			...m,
			overdue: !m.doneAt && !milestoneDone(m.key, row.stage, m.dueOn, today) && m.dueOn < today
		})),
		supports: sups.map((s) => ({
			...s,
			versions: countsBy.get(s.id)?.versions ?? 0,
			pending: countsBy.get(s.id)?.pending ?? 0,
			dueOn: due[STAGE_MILESTONE[Math.min(s.stage, 6)]!] ?? null
		})),
		kits: kitStates,
		tickets: ticketRows
	};
}

/** Marcas que el actor puede filtrar en el panel. */
export async function brandsFor(actor: Actor) {
	const all = await db.select().from(brands).orderBy(desc(brands.restaurantCount));
	if (actor.role === 'brand') return all.filter((b) => actor.brands.includes(b.code));
	if (actor.role === 'manager') return all.filter((b) => managerBrands(actor).includes(b.code));
	return all;
}

/** Responsables posibles (marketing de la marca), para el formulario. */
export async function ownersByBrand() {
	const rows = await db
		.select({ id: users.id, name: users.name, brandCode: userBrands.brandCode })
		.from(users)
		.innerJoin(userBrands, eq(userBrands.userId, users.id))
		.where(and(eq(users.role, 'brand'), eq(users.status, 'active')))
		.orderBy(asc(users.name));
	return rows;
}

/* ---------- Mutaciones (solo Administración y Operaciones) ---------- */

function requireEdit(actor: Actor, action: 'campaign.create' | 'campaign.edit') {
	if (!can(actor, action)) throw new CampaignError('No puedes modificar campañas');
}

async function snapshot(id: string) {
	const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
	if (!c) throw new CampaignError('Campaña no encontrada');
	return c;
}

async function checkOwner(ownerUserId: string | null, brandCode: string) {
	if (!ownerUserId) return;
	const owners = await ownersByBrand();
	if (!owners.some((o) => o.id === ownerUserId && o.brandCode === brandCode))
		throw new CampaignError('El responsable debe ser de marketing de la marca');
}

async function insertMilestones(tx: typeof db, campaignId: string, inRestaurantOn: string) {
	const { milestoneOffsets } = await getSettings();
	const dates = milestonesFor(inRestaurantOn, milestoneOffsets);
	await tx
		.insert(campaignMilestones)
		.values(MILESTONE_KEYS.map((key) => ({ campaignId, key, dueOn: dates[key] })));
}

/** Código nuevo bajo un cerrojo de transacción, para que dos altas a la vez no choquen. */
async function newId(tx: typeof db, brandCode: string, inRestaurantOn: string) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('campaign-id'))`);
	const [brand] = await tx
		.select({ prefix: brands.idPrefix })
		.from(brands)
		.where(eq(brands.code, brandCode));
	if (!brand?.prefix) throw new CampaignError('Marca desconocida');
	const existing = await tx
		.select({ id: campaigns.id })
		.from(campaigns)
		.where(sql`${campaigns.id} like ${brand.prefix + '-%'}`);
	return nextCampaignId(
		brand.prefix,
		inRestaurantOn,
		existing.map((e) => e.id)
	);
}

export async function createCampaign(actor: Actor, input: CampaignInput, meta: Meta = {}) {
	requireEdit(actor, 'campaign.create');
	await checkOwner(input.ownerUserId, input.brandCode);
	const id = await db.transaction(async (tx) => {
		const id = await newId(tx as unknown as typeof db, input.brandCode, input.inRestaurantOn);
		await tx.insert(campaigns).values({ id, ...input, createdBy: actor.id, updatedBy: actor.id });
		await insertMilestones(tx as unknown as typeof db, id, input.inRestaurantOn);
		return id;
	});
	await audit({
		userId: actor.id,
		action: 'campaign.created',
		entity: 'campaign',
		entityId: id,
		after: input,
		...meta
	});
	return id;
}

export async function updateCampaign(
	actor: Actor,
	id: string,
	input: Omit<CampaignInput, 'brandCode'>,
	meta: Meta = {}
) {
	requireEdit(actor, 'campaign.edit');
	const before = await snapshot(id);
	await checkOwner(input.ownerUserId, before.brandCode);
	await db.transaction(async (tx) => {
		await tx
			.update(campaigns)
			.set({ ...input, updatedAt: new Date(), updatedBy: actor.id })
			.where(eq(campaigns.id, id));
		// Si cambia la fecha en restaurante, los hitos pendientes se recalculan con los plazos vigentes.
		if (input.inRestaurantOn !== before.inRestaurantOn) {
			const { milestoneOffsets } = await getSettings();
			const dates = milestonesFor(input.inRestaurantOn, milestoneOffsets);
			for (const key of MILESTONE_KEYS)
				await tx
					.update(campaignMilestones)
					.set({ dueOn: dates[key] })
					.where(
						and(
							eq(campaignMilestones.campaignId, id),
							eq(campaignMilestones.key, key),
							isNull(campaignMilestones.doneAt)
						)
					);
		}
	});
	await audit({
		userId: actor.id,
		action: 'campaign.updated',
		entity: 'campaign',
		entityId: id,
		before: {
			name: before.name,
			inRestaurantOn: before.inRestaurantOn,
			restaurantCount: before.restaurantCount,
			planned: before.planned,
			ownerUserId: before.ownerUserId
		},
		after: input,
		...meta
	});
}

export async function updateMilestones(
	actor: Actor,
	id: string,
	dates: Record<MilestoneKey, string>,
	meta: Meta = {}
) {
	requireEdit(actor, 'campaign.edit');
	await snapshot(id);
	const before = await db
		.select()
		.from(campaignMilestones)
		.where(eq(campaignMilestones.campaignId, id));
	if (dates.rte !== (await snapshot(id)).inRestaurantOn)
		throw new CampaignError('El hito «En restaurante» se cambia con la fecha de la campaña');
	for (let i = 1; i < MILESTONE_KEYS.length; i++)
		if (dates[MILESTONE_KEYS[i]!] < dates[MILESTONE_KEYS[i - 1]!])
			throw new CampaignError('Los hitos tienen que ir en orden');
	await db.transaction(async (tx) => {
		for (const key of MILESTONE_KEYS)
			await tx
				.update(campaignMilestones)
				.set({ dueOn: dates[key] })
				.where(and(eq(campaignMilestones.campaignId, id), eq(campaignMilestones.key, key)));
	});
	await audit({
		userId: actor.id,
		action: 'campaign.milestones_updated',
		entity: 'campaign',
		entityId: id,
		before: Object.fromEntries(before.map((m) => [m.key, m.dueOn])),
		after: dates,
		...meta
	});
}

/** Duplicar como plantilla: mismos datos y soportes (en fase 0), fecha nueva e hitos recalculados. */
export async function duplicateCampaign(
	actor: Actor,
	id: string,
	p: { name: string; inRestaurantOn: string },
	meta: Meta = {}
) {
	requireEdit(actor, 'campaign.create');
	const source = await snapshot(id);
	const sourceSupports = await db
		.select()
		.from(supports)
		.where(eq(supports.campaignId, id))
		.orderBy(asc(supports.position));
	const newCampaignId = await db.transaction(async (tx) => {
		const nid = await newId(tx as unknown as typeof db, source.brandCode, p.inRestaurantOn);
		await tx.insert(campaigns).values({
			id: nid,
			brandCode: source.brandCode,
			name: p.name,
			inRestaurantOn: p.inRestaurantOn,
			restaurantCount: source.restaurantCount,
			ownerUserId: source.ownerUserId,
			planned: false,
			materials: source.materials,
			notes: source.notes,
			templateOf: id,
			createdBy: actor.id,
			updatedBy: actor.id
		});
		await insertMilestones(tx as unknown as typeof db, nid, p.inRestaurantOn);
		if (sourceSupports.length)
			await tx.insert(supports).values(
				sourceSupports.map((s, i) => ({
					id: `s-${randomUUID().slice(0, 12)}`,
					campaignId: nid,
					position: i,
					name: s.name,
					versionsPlanned: s.versionsPlanned,
					runQty: s.runQty,
					perKitQty: s.perKitQty,
					packaging: s.packaging,
					stage: 0,
					responsible: s.responsible,
					notes: null
				}))
			);
		return nid;
	});
	await audit({
		userId: actor.id,
		action: 'campaign.duplicated',
		entity: 'campaign',
		entityId: newCampaignId,
		after: { from: id, ...p },
		...meta
	});
	return newCampaignId;
}

export async function setArchived(actor: Actor, id: string, archived: boolean, meta: Meta = {}) {
	requireEdit(actor, 'campaign.edit');
	const before = await snapshot(id);
	if (!!before.archivedAt === archived) return;
	await db
		.update(campaigns)
		.set({
			archivedAt: archived ? new Date() : null,
			archivedBy: archived ? actor.id : null,
			updatedAt: new Date(),
			updatedBy: actor.id
		})
		.where(eq(campaigns.id, id));
	await audit({
		userId: actor.id,
		action: archived ? 'campaign.archived' : 'campaign.restored',
		entity: 'campaign',
		entityId: id,
		...meta
	});
}

/* ---------- Soportes ---------- */

export async function saveSupport(
	actor: Actor,
	campaignId: string,
	input: SupportInput,
	supportId: string | null,
	meta: Meta = {}
) {
	requireEdit(actor, 'campaign.edit');
	await snapshot(campaignId);
	if (supportId) {
		const [before] = await db
			.select()
			.from(supports)
			.where(and(eq(supports.id, supportId), eq(supports.campaignId, campaignId)));
		if (!before) throw new CampaignError('Soporte no encontrado');
		await db.update(supports).set(input).where(eq(supports.id, supportId));
		await audit({
			userId: actor.id,
			action: 'support.updated',
			entity: 'support',
			entityId: supportId,
			before,
			after: input,
			...meta
		});
		return supportId;
	}
	const [{ n } = { n: 0 }] = await db
		.select({ n: count() })
		.from(supports)
		.where(eq(supports.campaignId, campaignId));
	const id = `s-${randomUUID().slice(0, 12)}`;
	await db.insert(supports).values({ id, campaignId, position: n, ...input });
	await audit({
		userId: actor.id,
		action: 'support.created',
		entity: 'support',
		entityId: id,
		after: { campaignId, ...input },
		...meta
	});
	return id;
}

export async function deleteSupport(
	actor: Actor,
	campaignId: string,
	supportId: string,
	meta: Meta = {}
) {
	requireEdit(actor, 'campaign.edit');
	const [s] = await db
		.select()
		.from(supports)
		.where(and(eq(supports.id, supportId), eq(supports.campaignId, campaignId)));
	if (!s) throw new CampaignError('Soporte no encontrado');
	const [{ n } = { n: 0 }] = await db
		.select({ n: count() })
		.from(supportVersions)
		.where(eq(supportVersions.supportId, supportId));
	if (n > 0) throw new CampaignError('El soporte ya tiene artes finales: no se puede eliminar');
	await db.delete(supports).where(eq(supports.id, supportId));
	await audit({
		userId: actor.id,
		action: 'support.deleted',
		entity: 'support',
		entityId: supportId,
		before: s,
		...meta
	});
}
