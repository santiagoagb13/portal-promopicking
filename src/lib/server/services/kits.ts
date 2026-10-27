/**
 * Kits y trazabilidad (8.6): generación desde el maestro, escaneos de expedición, plataforma y
 * reparto, recepción en el restaurante e incidencias. Los eventos llevan la hora del dispositivo
 * (`at`) y un id de cliente para que la cola sin conexión no los duplique al reenviarlos.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import {
	checkScan,
	kitIdFor,
	STEP_LABEL,
	STEP_STATE,
	versionFor,
	type KitEventType,
	type ScanStep
} from '$lib/domain/kits';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { db, tables } from '../db';
import { fileStorage } from '../storage';

const {
	kits,
	kitEvents,
	kitLines,
	restaurants,
	campaigns,
	brands,
	supports,
	supportVersions,
	tickets,
	notifications,
	users
} = tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class KitError extends Error {}

/** Fotos de recepción e incidencia (4.3): JPEG, PNG o WebP por su firma, 10 MB como máximo. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function photoType(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (
		Buffer.from(b.subarray(0, 4)).toString('latin1') === 'RIFF' &&
		Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WEBP'
	)
		return 'webp';
	return null;
}

export async function storePhoto(kitId: string, bytes: Uint8Array): Promise<string> {
	if (bytes.byteLength > MAX_PHOTO_BYTES) throw new KitError('La foto pasa de 10 MB');
	const type = photoType(bytes);
	if (!type) throw new KitError('La foto tiene que ser JPEG, PNG o WebP');
	const key = `fotos/${kitId}/${randomUUID()}.${type}`;
	await fileStorage().put(key, bytes, type === 'jpg' ? 'image/jpeg' : `image/${type}`);
	return key;
}

/** Ámbito de kits: marca → su marca; gerente → sus restaurantes; internos y producción → todos. */
function kitScope(actor: Actor): SQL | undefined {
	if (actor.role === 'brand')
		return actor.brands.length ? inArray(campaigns.brandCode, actor.brands) : sql`false`;
	if (actor.role === 'manager') {
		const mine = actor.restaurants.map((r) => r.id);
		return mine.length ? inArray(kits.restaurantId, mine) : sql`false`;
	}
	return undefined;
}

/** Campañas con kits (o en kitting y sin generar), para el selector. */
export async function kitCampaigns(actor: Actor) {
	const rows = await db
		.select({
			id: campaigns.id,
			name: campaigns.name,
			brandShort: brands.short,
			inRestaurantOn: campaigns.inRestaurantOn,
			// Dentro del select Drizzle no cualifica columnas: la referencia exterior va escrita a mano.
			kits: sql<number>`(select count(*)::int from ${kits} k where k.campaign_id = "campaigns"."id")`
		})
		.from(campaigns)
		.innerJoin(brands, eq(brands.code, campaigns.brandCode))
		.where(
			and(
				isNull(campaigns.archivedAt),
				actor.role === 'brand'
					? inArray(campaigns.brandCode, actor.brands.length ? actor.brands : [''])
					: undefined
			)
		)
		.orderBy(asc(campaigns.inRestaurantOn));
	return rows;
}

export async function listKits(actor: Actor, campaignId: string, state?: number) {
	return db
		.select({
			id: kits.id,
			restaurantId: kits.restaurantId,
			restaurantName: restaurants.name,
			city: restaurants.city,
			parcels: kits.parcels,
			state: kits.state,
			incidentTicketId: kits.incidentTicketId,
			lastAt: sql<Date | null>`(select max(e.at) from ${kitEvents} e where e.kit_id = "kits"."id")`,
			lastType: sql<KitEventType | null>`(select e.type from ${kitEvents} e where e.kit_id = "kits"."id" order by e.at desc, e.id desc limit 1)`
		})
		.from(kits)
		.innerJoin(restaurants, eq(restaurants.id, kits.restaurantId))
		.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
		.where(
			and(
				eq(kits.campaignId, campaignId),
				state === undefined ? undefined : eq(kits.state, state),
				kitScope(actor)
			)
		)
		.orderBy(asc(kits.restaurantId));
}

export async function kitSummary(actor: Actor, campaignId: string) {
	const rows = await db
		.select({ state: kits.state, n: count() })
		.from(kits)
		.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
		.where(and(eq(kits.campaignId, campaignId), kitScope(actor)))
		.groupBy(kits.state);
	return [0, 1, 2, 3, 4].map((s) => rows.find((r) => r.state === s)?.n ?? 0);
}

export async function getKit(actor: Actor, kitId: string) {
	const [k] = await db
		.select({
			id: kits.id,
			state: kits.state,
			parcels: kits.parcels,
			receivedBy: kits.receivedBy,
			receivedAt: kits.receivedAt,
			incidentTicketId: kits.incidentTicketId,
			campaignId: campaigns.id,
			campaignName: campaigns.name,
			brandCode: campaigns.brandCode,
			brandShort: brands.short,
			restaurantId: restaurants.id,
			restaurantName: restaurants.name,
			address: restaurants.address,
			city: restaurants.city,
			deliveryPoint: restaurants.deliveryPoint
		})
		.from(kits)
		.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
		.innerJoin(brands, eq(brands.code, campaigns.brandCode))
		.innerJoin(restaurants, eq(restaurants.id, kits.restaurantId))
		// Sin distinguir mayúsculas: el lector las pone siempre y hay códigos como K-VI2603b-0056.
		.where(and(sql`lower(${kits.id}) = lower(${kitId})`, kitScope(actor)));
	if (!k) return null;
	kitId = k.id;
	const [events, lines] = await Promise.all([
		db
			.select({
				id: kitEvents.id,
				at: kitEvents.at,
				recordedAt: kitEvents.recordedAt,
				type: kitEvents.type,
				source: kitEvents.source,
				who: sql<string>`coalesce(${users.name}, ${kitEvents.byLabel})`,
				photoKey: kitEvents.photoKey,
				detail: kitEvents.detail
			})
			.from(kitEvents)
			.leftJoin(users, eq(users.id, kitEvents.byUserId))
			.where(eq(kitEvents.kitId, kitId))
			.orderBy(asc(kitEvents.at), asc(kitEvents.id)),
		db.select().from(kitLines).where(eq(kitLines.kitId, kitId)).orderBy(asc(kitLines.id))
	]);
	return { ...k, events, lines };
}

/* ---------- Generación desde el maestro ---------- */

/**
 * Crea un kit por restaurante activo de la marca que aún no lo tenga, con una línea por soporte:
 * la versión que corresponde a su tarifa, surtido e idioma y las unidades por kit del soporte.
 */
export async function generateKits(actor: Actor, campaignId: string, meta: Meta = {}) {
	if (!can(actor, 'campaign.edit')) throw new KitError('Solo Promopicking genera kits');
	const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
	if (!c) throw new KitError('Campaña no encontrada');
	const [rests, sups, existing] = await Promise.all([
		db
			.select()
			.from(restaurants)
			.where(and(eq(restaurants.brandCode, c.brandCode), eq(restaurants.active, true)))
			.orderBy(asc(restaurants.id)),
		db
			.select()
			.from(supports)
			.where(eq(supports.campaignId, campaignId))
			.orderBy(asc(supports.position)),
		db.select({ restaurantId: kits.restaurantId }).from(kits).where(eq(kits.campaignId, campaignId))
	]);
	if (!sups.length) throw new KitError('La campaña no tiene soportes');
	const versions = await db
		.select({
			supportId: supportVersions.supportId,
			code: supportVersions.code,
			tariff: supportVersions.tariff,
			assortment: supportVersions.assortment,
			language: supportVersions.language
		})
		.from(supportVersions)
		.where(
			and(
				inArray(
					supportVersions.supportId,
					sups.map((s) => s.id)
				),
				isNull(supportVersions.supersededAt)
			)
		);
	const done = new Set(existing.map((e) => e.restaurantId));
	const todo = rests.filter((r) => !done.has(r.id));
	await db.transaction(async (tx) => {
		for (const r of todo) {
			const id = kitIdFor(campaignId, r.id);
			const lines = sups.map((s) => ({
				kitId: id,
				supportId: s.id,
				label: s.name,
				versionCode: versionFor(
					r,
					versions.filter((v) => v.supportId === s.id)
				),
				qty: s.perKitQty ?? 1
			}));
			await tx.insert(kits).values({
				id,
				campaignId,
				restaurantId: r.id,
				parcels: lines.length > 3 ? 2 : 1,
				state: 0
			});
			await tx.insert(kitLines).values(lines);
			await tx
				.insert(kitEvents)
				.values({ kitId: id, at: new Date(), type: 'prepared', byUserId: actor.id, source: 'web' });
		}
	});
	await audit({
		userId: actor.id,
		action: 'kits.generated',
		entity: 'campaign',
		entityId: campaignId,
		after: { kits: todo.length },
		...meta
	});
	return todo.length;
}

/* ---------- Escaneo ---------- */

export type ScanInput = {
	kitId: string;
	step: ScanStep;
	at?: Date;
	clientId?: string | null;
	source?: 'web' | 'scanner' | 'mobile';
};
export type ScanResult = {
	kitId: string;
	restaurant: string;
	campaign: string;
	step: ScanStep;
	label: string;
	state: number;
	already: boolean;
};

/**
 * Hora del dispositivo, acotada: nunca en el futuro, ni de hace más de 14 días, ni anterior al
 * último evento del kit (un reloj adelantado o atrasado no desordena la trazabilidad).
 */
function clampAt(at: Date | undefined, notBefore?: Date | null): Date {
	const now = Date.now();
	const t = !at || Number.isNaN(at.getTime()) ? now : at.getTime();
	return new Date(Math.min(now, Math.max(now - 14 * 86_400_000, notBefore?.getTime() ?? 0, t)));
}

const lastEventAt = (kit: { events: { at: Date }[] }) => kit.events.at(-1)?.at ?? null;

async function duplicateOf(clientId: string | null | undefined) {
	if (!clientId) return null;
	const [e] = await db
		.select({ id: kitEvents.id })
		.from(kitEvents)
		.where(eq(kitEvents.clientEventId, clientId));
	return e ?? null;
}

export async function registerScan(
	actor: Actor,
	p: ScanInput,
	meta: Meta = {}
): Promise<ScanResult> {
	if (!can(actor, 'kit.scan', { scanStep: p.step }))
		throw new KitError(
			actor.role === 'production'
				? 'Producción solo registra la expedición'
				: 'No puedes escanear kits'
		);
	const kit = await getKit(actor, p.kitId);
	if (!kit) throw new KitError(`No existe el kit ${p.kitId}`);
	const base = {
		kitId: kit.id,
		restaurant: kit.restaurantName,
		campaign: kit.campaignName,
		step: p.step,
		label: STEP_LABEL[p.step]
	};
	if (await duplicateOf(p.clientId)) return { ...base, state: kit.state, already: true };
	const check = checkScan(kit.state, p.step);
	if (!check.ok) throw new KitError(check.message);
	if (check.already) return { ...base, state: kit.state, already: true };
	const at = clampAt(p.at, lastEventAt(kit));
	const state = STEP_STATE[p.step];
	await db.transaction(async (tx) => {
		const moved = await tx
			.update(kits)
			.set({ state })
			.where(and(eq(kits.id, kit.id), eq(kits.state, state - 1)))
			.returning({ id: kits.id });
		if (!moved.length) return; // otro dispositivo lo registró a la vez: ya consta
		await tx.insert(kitEvents).values({
			kitId: kit.id,
			at,
			type: p.step,
			byUserId: actor.id,
			source: p.source ?? 'scanner',
			clientEventId: p.clientId ?? null
		});
	});
	await audit({
		userId: actor.id,
		action: `kit.${p.step}`,
		entity: 'kit',
		entityId: kit.id,
		after: { at, source: p.source ?? 'scanner' },
		...meta
	});
	return { ...base, state, already: false };
}

/* ---------- Recepción e incidencias ---------- */

function requireReceive(actor: Actor, restaurantId: string) {
	if (!can(actor, 'kit.receive', { restaurantId }))
		throw new KitError('Solo el restaurante confirma su recepción');
}

/** Recepción: todos los bultos comprobados; el kit pasa a «Recibido». */
export async function receiveKit(
	actor: Actor & { name?: string },
	kitId: string,
	p: {
		parcelsChecked: number[];
		at?: Date;
		clientId?: string | null;
		photoKey?: string | null;
	} & Meta
) {
	const kit = await getKit(actor, kitId);
	if (!kit) throw new KitError(`No existe el kit ${kitId}`);
	kitId = kit.id;
	requireReceive(actor, kit.restaurantId);
	if (await duplicateOf(p.clientId)) return { already: true, kitId };
	if (kit.state === 4) return { already: true, kitId };
	if (kit.state === 0) throw new KitError('El kit aún no ha salido de producción');
	const missing = Array.from({ length: kit.parcels }, (_, i) => i + 1).filter(
		(n) => !p.parcelsChecked.includes(n)
	);
	if (missing.length)
		throw new KitError(
			`Faltan bultos por comprobar (${missing.join(', ')}): si no han llegado, abre una incidencia`
		);
	const at = clampAt(p.at, lastEventAt(kit));
	await db.transaction(async (tx) => {
		await tx
			.update(kits)
			.set({ state: 4, receivedBy: actor.name ?? null, receivedAt: at })
			.where(eq(kits.id, kitId));
		await tx.insert(kitEvents).values({
			kitId,
			at,
			type: 'received',
			byUserId: actor.id,
			source: 'mobile',
			photoKey: p.photoKey ?? null,
			clientEventId: p.clientId ?? null,
			detail: { parcels: p.parcelsChecked }
		});
	});
	await audit({
		userId: actor.id,
		action: 'kit.received',
		entity: 'kit',
		entityId: kitId,
		after: { at, parcels: p.parcelsChecked },
		ip: p.ip,
		userAgent: p.userAgent
	});
	return { already: false, kitId };
}

async function nextIncidentId(tx: typeof db) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ticket-id'))`);
	const [row] = await tx
		.select({ max: sql<number | null>`max(substring(${tickets.id} from 5)::int)` })
		.from(tickets)
		.where(sql`${tickets.id} like 'INC-%'`);
	return `INC-${(row?.max ?? 2000) + 1}`;
}

/** Incidencia desde la recepción: ticket de soporte, evento en el kit y aviso a Operaciones. */
export async function openIncident(
	actor: Actor & { name?: string },
	kitId: string,
	p: {
		kind: string;
		text: string;
		photoKey: string | null;
		at?: Date;
		clientId?: string | null;
	} & Meta
) {
	const kit = await getKit(actor, kitId);
	if (!kit) throw new KitError(`No existe el kit ${kitId}`);
	kitId = kit.id;
	if (!can(actor, 'incident.open', { restaurantId: kit.restaurantId }))
		throw new KitError('No puedes abrir incidencias de este restaurante');
	if (await duplicateOf(p.clientId)) return { already: true, ticketId: kit.incidentTicketId };
	if (!p.photoKey) throw new KitError('La incidencia necesita una foto');
	const text = p.text.trim();
	if (text.length < 3) throw new KitError('Describe la incidencia');
	const at = clampAt(p.at, lastEventAt(kit));
	const ticketId = await db.transaction(async (tx) => {
		const id = await nextIncidentId(tx as unknown as typeof db);
		await tx.insert(tickets).values({
			id,
			campaignId: kit.campaignId,
			restaurantId: kit.restaurantId,
			type: 'incident',
			kind: p.kind,
			title: `${p.kind} · ${kit.restaurantName} · ${kit.id}`,
			severity: p.kind === 'Bulto dañado' || p.kind === 'Versión incorrecta' ? 'high' : 'medium',
			state: 'open',
			openedBy: actor.id,
			openedAt: at
		});
		await tx
			.insert(tables.ticketUpdates)
			.values({ ticketId: id, at, userId: actor.id, text, photoKey: p.photoKey });
		await tx.update(kits).set({ incidentTicketId: id }).where(eq(kits.id, kitId));
		await tx.insert(kitEvents).values({
			kitId,
			at,
			type: 'incident',
			byUserId: actor.id,
			source: 'mobile',
			photoKey: p.photoKey,
			clientEventId: p.clientId ?? null,
			detail: { ticketId: id, kind: p.kind, text }
		});
		return id;
	});
	const ops = await db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.role, ['ops', 'admin']), eq(users.status, 'active')));
	if (ops.length)
		await db.insert(notifications).values(
			ops.map((u) => ({
				id: randomUUID(),
				userId: u.id,
				kind: 'kit.incident',
				title: `${ticketId} · ${p.kind} · ${kit.restaurantName}`,
				entity: 'ticket',
				entityId: ticketId,
				href: `/kits/${kit.id}`
			}))
		);
	await audit({
		userId: actor.id,
		action: 'kit.incident',
		entity: 'kit',
		entityId: kitId,
		after: { ticketId, kind: p.kind },
		ip: p.ip,
		userAgent: p.userAgent
	});
	return { already: false, ticketId };
}

/** Kits que esperan su recepción en los restaurantes del actor, y los últimos recibidos. */
export async function receptionList(actor: Actor) {
	const mine = actor.role === 'manager' ? actor.restaurants.map((r) => r.id) : null;
	const select = {
		id: kits.id,
		state: kits.state,
		parcels: kits.parcels,
		incidentTicketId: kits.incidentTicketId,
		receivedAt: kits.receivedAt,
		campaignName: campaigns.name,
		inRestaurantOn: campaigns.inRestaurantOn,
		restaurantName: restaurants.name
	};
	const scope = mine ? inArray(kits.restaurantId, mine.length ? mine : ['']) : undefined;
	const [pendingRows, received] = await Promise.all([
		db
			.select(select)
			.from(kits)
			.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
			.innerJoin(restaurants, eq(restaurants.id, kits.restaurantId))
			.where(and(scope, sql`${kits.state} between 1 and 3`))
			.orderBy(desc(kits.state), asc(campaigns.inRestaurantOn), asc(kits.id))
			.limit(mine ? 100 : 40),
		db
			.select(select)
			.from(kits)
			.innerJoin(campaigns, eq(campaigns.id, kits.campaignId))
			.innerJoin(restaurants, eq(restaurants.id, kits.restaurantId))
			.where(and(scope, eq(kits.state, 4)))
			.orderBy(desc(kits.receivedAt))
			.limit(5)
	]);
	const ids = pendingRows.map((r) => r.id);
	const lines = ids.length
		? await db.select().from(kitLines).where(inArray(kitLines.kitId, ids)).orderBy(asc(kitLines.id))
		: [];
	return {
		pending: pendingRows.map((r) => ({ ...r, lines: lines.filter((l) => l.kitId === r.id) })),
		received
	};
}
