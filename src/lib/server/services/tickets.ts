/**
 * Soporte e incidencias (8.11): lista con filtros, hilo con fotos, responder, asignar, severidad,
 * cerrar y reabrir. Avisa en la campana y por correo al responsable y a quien abrió el registro.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import {
	SEVERITY_LABEL,
	TICKET_STATE_LABEL,
	titleFrom,
	type Severity,
	type TicketState,
	type TicketType
} from '$lib/domain/tickets';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { config } from '../config';
import { db, tables } from '../db';
import { sendMail } from '../mail';
import { ticketMail } from '../mail/templates';
import { fileStorage } from '../storage';
import { campaignScope } from './campaigns';
import { photoType } from './kits';

const { tickets, ticketUpdates, campaigns, restaurants, users, notifications, kits, orders } =
	tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class TicketError extends Error {}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Siguiente id de ticket (`INC-2042`, `CON-2039`), bajo un cerrojo de transacción. */
export async function nextTicketId(tx: typeof db, prefix: 'INC' | 'CON'): Promise<string> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ticket-id'))`);
	const [row] = await tx
		.select({ max: sql<number | null>`max(substring(${tickets.id} from 5)::int)` })
		.from(tickets)
		.where(sql`${tickets.id} like ${prefix + '-%'}`);
	return `${prefix}-${(row?.max ?? 2000) + 1}`;
}

/**
 * Ámbito: Promopicking y Albatros ven todo; la marca, lo de sus campañas y restaurantes; el
 * gerente, lo de sus restaurantes. Cada cual ve además lo que abrió o tiene asignado.
 */
function ticketScope(actor: Actor): SQL | undefined {
	if (actor.role === 'admin' || actor.role === 'ops' || actor.role === 'production')
		return undefined;
	const own = or(eq(tickets.openedBy, actor.id), eq(tickets.assignedTo, actor.id))!;
	if (actor.role === 'brand') {
		const b = actor.brands.length ? actor.brands : [''];
		return or(own, inArray(campaigns.brandCode, b), inArray(restaurants.brandCode, b));
	}
	const mine = actor.restaurants.map((r) => r.id);
	return mine.length ? or(own, inArray(tickets.restaurantId, mine)) : own;
}

export type TicketFilters = {
	open?: boolean;
	type?: TicketType;
	campaignId?: string;
	restaurantId?: string;
	severity?: Severity;
};

// En las subconsultas de `select` Drizzle no cualifica las columnas: "tickets"."…" literal.
const opener = sql<string>`coalesce(${tickets.openedByLabel}, (select u.name from ${users} u where u.id = "tickets"."opened_by"), 'Usuario eliminado')`;
const assignee = sql<
	string | null
>`(select u.name from ${users} u where u.id = "tickets"."assigned_to")`;

const listSelect = {
	id: tickets.id,
	type: tickets.type,
	kind: tickets.kind,
	title: tickets.title,
	severity: tickets.severity,
	state: tickets.state,
	openedAt: tickets.openedAt,
	closedAt: tickets.closedAt,
	updatedAt: tickets.updatedAt,
	openedBy: tickets.openedBy,
	openedByName: opener,
	assignedTo: tickets.assignedTo,
	assigneeName: assignee,
	campaignId: tickets.campaignId,
	campaignName: campaigns.name,
	brandCode: sql<string | null>`coalesce(${campaigns.brandCode}, ${restaurants.brandCode})`,
	restaurantId: tickets.restaurantId,
	restaurantName: restaurants.name,
	orderId: tickets.orderId,
	replies: sql<number>`(select count(*)::int from ${ticketUpdates} tu where tu.ticket_id = "tickets"."id" and tu.kind = 'reply')`
};

export async function listTickets(actor: Actor, f: TicketFilters = {}) {
	return db
		.select(listSelect)
		.from(tickets)
		.leftJoin(campaigns, eq(campaigns.id, tickets.campaignId))
		.leftJoin(restaurants, eq(restaurants.id, tickets.restaurantId))
		.where(
			and(
				ticketScope(actor),
				f.open ? ne(tickets.state, 'closed') : undefined,
				f.type ? eq(tickets.type, f.type) : undefined,
				f.campaignId ? eq(tickets.campaignId, f.campaignId) : undefined,
				f.restaurantId ? eq(tickets.restaurantId, f.restaurantId) : undefined,
				f.severity ? eq(tickets.severity, f.severity) : undefined
			)
		)
		.orderBy(
			sql`case when ${tickets.state} = 'closed' then 1 else 0 end`,
			sql`case ${tickets.severity} when 'high' then 0 when 'medium' then 1 else 2 end`,
			desc(tickets.openedAt)
		)
		.limit(200);
}

/** Registros abiertos que ve el actor (contador de la navegación: incidencias). */
export async function openTicketCount(actor: Actor, type?: TicketType): Promise<number> {
	const [r] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(tickets)
		.leftJoin(campaigns, eq(campaigns.id, tickets.campaignId))
		.leftJoin(restaurants, eq(restaurants.id, tickets.restaurantId))
		.where(
			and(
				ticketScope(actor),
				ne(tickets.state, 'closed'),
				type ? eq(tickets.type, type) : undefined
			)
		);
	return r?.n ?? 0;
}

export type TicketRights = { reply: boolean; manage: boolean; close: boolean; reopen: boolean };

type RightsInput = {
	openedBy: string | null;
	assignedTo: string | null;
	brandCode: string | null;
	state: string;
};

function responds(actor: Actor, t: RightsInput) {
	return can(actor, 'ticket.respond', {
		openedBy: t.openedBy,
		assignedTo: t.assignedTo,
		brandCode: t.brandCode ?? undefined
	});
}

function rights(actor: Actor, t: RightsInput): TicketRights {
	const respond = responds(actor, t);
	const opener = t.openedBy === actor.id;
	const closed = t.state === 'closed';
	return {
		// Quien abrió puede añadir datos a su registro aunque no gestione tickets (ADR 0010).
		reply: !closed && (respond || opener),
		manage: !closed && can(actor, 'ticket.manage'),
		close: !closed && respond,
		reopen: closed && (respond || opener)
	};
}

export async function getTicket(actor: Actor, id: string) {
	const [t] = await db
		.select(listSelect)
		.from(tickets)
		.leftJoin(campaigns, eq(campaigns.id, tickets.campaignId))
		.leftJoin(restaurants, eq(restaurants.id, tickets.restaurantId))
		.where(and(eq(tickets.id, id), ticketScope(actor)));
	if (!t) return null;
	const [thread, [kit]] = await Promise.all([
		db
			.select({
				id: ticketUpdates.id,
				at: ticketUpdates.at,
				kind: ticketUpdates.kind,
				text: ticketUpdates.text,
				photoKey: ticketUpdates.photoKey,
				author: sql<string>`coalesce(${ticketUpdates.authorLabel}, ${users.name}, 'Usuario eliminado')`,
				// Las etiquetas importadas ya llevan la organización («Jorge Martín · Promopicking»).
				organization: sql<
					string | null
				>`case when ${ticketUpdates.authorLabel} is null then ${users.organization} end`
			})
			.from(ticketUpdates)
			.leftJoin(users, eq(users.id, ticketUpdates.userId))
			.where(eq(ticketUpdates.ticketId, id))
			.orderBy(asc(ticketUpdates.at), asc(ticketUpdates.id)),
		db.select({ id: kits.id }).from(kits).where(eq(kits.incidentTicketId, id)).limit(1)
	]);
	const storage = fileStorage();
	const updates = await Promise.all(
		thread.map(async ({ photoKey, ...u }) => ({
			...u,
			photoUrl: photoKey ? await storage.readUrl(photoKey) : null
		}))
	);
	return { ...t, kitId: kit?.id ?? null, updates, can: rights(actor, t) };
}

/** Opciones de los filtros y del alta: campañas, restaurantes y responsables posibles. */
export async function ticketOptions(actor: Actor) {
	const restScope =
		actor.role === 'brand'
			? inArray(restaurants.brandCode, actor.brands.concat(['']))
			: actor.role === 'manager'
				? inArray(restaurants.id, actor.restaurants.map((r) => r.id).concat(['']))
				: undefined;
	const [camps, rests, people] = await Promise.all([
		db
			.select({ id: campaigns.id, name: campaigns.name, brandCode: campaigns.brandCode })
			.from(campaigns)
			.where(and(campaignScope(actor), isNull(campaigns.archivedAt)))
			.orderBy(desc(campaigns.inRestaurantOn)),
		db
			.select({ id: restaurants.id, name: restaurants.name, brandCode: restaurants.brandCode })
			.from(restaurants)
			.where(and(eq(restaurants.active, true), restScope))
			.orderBy(asc(restaurants.brandCode), asc(restaurants.name)),
		can(actor, 'ticket.manage')
			? db
					.select({ id: users.id, name: users.name, organization: users.organization })
					.from(users)
					.where(
						and(inArray(users.role, ['admin', 'ops', 'production']), eq(users.status, 'active'))
					)
					.orderBy(asc(users.name))
			: Promise.resolve([])
	]);
	return { campaigns: camps, restaurants: rests, assignees: people };
}

export async function storeTicketPhoto(folder: string, bytes: Uint8Array): Promise<string> {
	if (bytes.byteLength > MAX_PHOTO_BYTES) throw new TicketError('La foto pasa de 10 MB');
	const type = photoType(bytes);
	if (!type) throw new TicketError('La foto tiene que ser JPEG, PNG o WebP');
	const key = `fotos/soporte/${folder}/${randomUUID()}.${type}`;
	await fileStorage().put(key, bytes, type === 'jpg' ? 'image/jpeg' : `image/${type}`);
	return key;
}

/** Avisa en la campana y por correo a quien abrió y al responsable (nunca a quien actúa). */
async function notifyParties(
	t: { id: string; openedBy: string | null; assignedTo: string | null; title: string },
	actorId: string,
	what: string,
	extra: string[] = []
) {
	const ids = [...new Set([t.openedBy, t.assignedTo, ...extra])].filter(
		(x): x is string => !!x && x !== actorId
	);
	if (!ids.length) return;
	const people = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(and(inArray(users.id, ids), eq(users.status, 'active')));
	if (!people.length) return;
	const href = `/soporte?abrir=${t.id}`;
	await db.insert(notifications).values(
		people.map((p) => ({
			id: randomUUID(),
			userId: p.id,
			kind: 'ticket.update',
			title: `${t.id} · ${what}`,
			entity: 'ticket',
			entityId: t.id,
			href
		}))
	);
	// El correo no debe tumbar la acción: si falla, el aviso en la campana ya está.
	await Promise.all(
		people.map((p) =>
			sendMail(
				ticketMail({
					to: p.email,
					id: t.id,
					title: t.title,
					what,
					url: `${config.authOrigin}${href}`
				})
			).catch(() => undefined)
		)
	);
}

async function opsIds() {
	const ops = await db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.role, ['ops', 'admin']), eq(users.status, 'active')));
	return ops.map((u) => u.id);
}

export type NewTicket = {
	type: TicketType;
	kind: string;
	campaignId: string | null;
	restaurantId: string | null;
	orderId?: string | null;
	text: string;
	photoKey?: string | null;
};

export async function createTicket(
	actor: Actor & { name?: string },
	p: NewTicket,
	meta: Meta = {}
) {
	const text = p.text.trim();
	if (text.length < 3) throw new TicketError('Describe la consulta o la incidencia');
	const opts = await ticketOptions(actor);
	if (p.campaignId && !opts.campaigns.some((c) => c.id === p.campaignId))
		throw new TicketError('Campaña no encontrada');
	if (p.restaurantId && !opts.restaurants.some((r) => r.id === p.restaurantId))
		throw new TicketError('Restaurante no encontrado');
	let restaurantId = p.restaurantId;
	if (p.orderId) {
		const [o] = await db
			.select({ restaurantId: orders.restaurantId })
			.from(orders)
			.where(eq(orders.id, p.orderId));
		if (!o || (restaurantId && o.restaurantId !== restaurantId))
			throw new TicketError('Pedido no encontrado');
		if (!opts.restaurants.some((r) => r.id === o.restaurantId) && actor.role !== 'production')
			throw new TicketError('Pedido no encontrado');
		restaurantId = o.restaurantId;
	}
	if (!p.campaignId && !restaurantId) throw new TicketError('Indica la campaña o el restaurante');
	const title = titleFrom(text);
	const now = new Date();
	const id = await db.transaction(async (tx) => {
		const id = await nextTicketId(
			tx as unknown as typeof db,
			p.type === 'incident' ? 'INC' : 'CON'
		);
		await tx.insert(tickets).values({
			id,
			campaignId: p.campaignId,
			restaurantId,
			orderId: p.orderId ?? null,
			type: p.type,
			kind: p.kind,
			title,
			severity: p.type === 'incident' ? 'medium' : 'low',
			state: 'open',
			openedBy: actor.id,
			openedAt: now,
			updatedAt: now
		});
		await tx
			.insert(ticketUpdates)
			.values({ ticketId: id, at: now, userId: actor.id, text, photoKey: p.photoKey ?? null });
		return id;
	});
	await notifyParties(
		{ id, openedBy: actor.id, assignedTo: null, title },
		actor.id,
		`nuevo registro de ${actor.name ?? 'un usuario'}`,
		await opsIds()
	);
	await audit({
		userId: actor.id,
		action: 'ticket.created',
		entity: 'ticket',
		entityId: id,
		after: {
			type: p.type,
			kind: p.kind,
			campaignId: p.campaignId,
			restaurantId,
			orderId: p.orderId
		},
		...meta
	});
	return id;
}

async function load(actor: Actor, id: string) {
	const t = await getTicket(actor, id);
	if (!t) throw new TicketError('Registro no encontrado');
	return t;
}

/** Deja el cambio en el hilo y lo aplica al registro en la misma transacción. */
async function log(
	id: string,
	actorId: string,
	kind: string,
	text: string,
	patch: Partial<typeof tickets.$inferInsert>,
	photoKey: string | null = null
) {
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.insert(ticketUpdates)
			.values({ ticketId: id, at: now, userId: actorId, kind, text, photoKey });
		await tx
			.update(tickets)
			.set({ ...patch, updatedAt: now })
			.where(eq(tickets.id, id));
	});
}

/**
 * Responder: quien gestiona deja el registro «Respondida»; si escribe quien lo abrió, pasa a
 * «En curso» para que Promopicking lo vea.
 */
export async function replyTicket(
	actor: Actor & { name?: string },
	id: string,
	text: string,
	photoKey: string | null,
	meta: Meta = {}
) {
	const t = await load(actor, id);
	if (!t.can.reply)
		throw new TicketError(
			t.state === 'closed'
				? 'El registro está cerrado: reábrelo para responder'
				: 'No puedes responder a este registro'
		);
	const body = text.trim();
	if (body.length < 2 && !photoKey) throw new TicketError('Escribe la respuesta');
	const answering = t.openedBy !== actor.id && responds(actor, t);
	const state: TicketState = answering ? 'answered' : 'in_progress';
	await log(id, actor.id, 'reply', body || 'Foto adjunta', { state }, photoKey);
	await notifyParties(
		t,
		actor.id,
		`respuesta de ${actor.name ?? 'un usuario'}`,
		answering || t.assignedTo ? [] : await opsIds()
	);
	await audit({
		userId: actor.id,
		action: 'ticket.replied',
		entity: 'ticket',
		entityId: id,
		before: { state: t.state },
		after: { state },
		...meta
	});
}

export async function assignTicket(
	actor: Actor & { name?: string },
	id: string,
	userId: string | null,
	meta: Meta = {}
) {
	const t = await load(actor, id);
	if (!t.can.manage) throw new TicketError('Solo Promopicking asigna responsables');
	if (userId === t.assignedTo) return;
	const people = (await ticketOptions(actor)).assignees;
	const who = userId ? people.find((p) => p.id === userId) : null;
	if (userId && !who) throw new TicketError('Responsable no válido');
	await log(id, actor.id, 'assign', who ? `Responsable: ${who.name}` : 'Sin responsable', {
		assignedTo: userId,
		...(t.state === 'open' && userId ? { state: 'in_progress' as const } : {})
	});
	if (who) await notifyParties({ ...t, assignedTo: who.id }, actor.id, `asignado a ${who.name}`);
	await audit({
		userId: actor.id,
		action: 'ticket.assigned',
		entity: 'ticket',
		entityId: id,
		before: { assignedTo: t.assignedTo },
		after: { assignedTo: userId },
		...meta
	});
}

export async function setSeverity(actor: Actor, id: string, severity: Severity, meta: Meta = {}) {
	const t = await load(actor, id);
	if (!t.can.manage) throw new TicketError('Solo Promopicking cambia la severidad');
	if (severity === t.severity) return;
	await log(id, actor.id, 'severity', `Severidad ${SEVERITY_LABEL[severity].toLowerCase()}`, {
		severity
	});
	await audit({
		userId: actor.id,
		action: 'ticket.severity',
		entity: 'ticket',
		entityId: id,
		before: { severity: t.severity },
		after: { severity },
		...meta
	});
}

export async function closeTicket(actor: Actor & { name?: string }, id: string, meta: Meta = {}) {
	const t = await load(actor, id);
	if (!t.can.close) throw new TicketError('No puedes cerrar este registro');
	await log(id, actor.id, 'state', TICKET_STATE_LABEL.closed, {
		state: 'closed',
		closedAt: new Date()
	});
	await notifyParties(t, actor.id, `cerrado por ${actor.name ?? 'un usuario'}`);
	await audit({
		userId: actor.id,
		action: 'ticket.closed',
		entity: 'ticket',
		entityId: id,
		before: { state: t.state },
		...meta
	});
}

export async function reopenTicket(actor: Actor & { name?: string }, id: string, meta: Meta = {}) {
	const t = await load(actor, id);
	if (!t.can.reopen) throw new TicketError('No puedes reabrir este registro');
	await log(id, actor.id, 'state', 'Reabierta', {
		state: t.assignedTo ? 'in_progress' : 'open',
		closedAt: null
	});
	await notifyParties(
		t,
		actor.id,
		`reabierto por ${actor.name ?? 'un usuario'}`,
		t.assignedTo ? [] : await opsIds()
	);
	await audit({
		userId: actor.id,
		action: 'ticket.reopened',
		entity: 'ticket',
		entityId: id,
		...meta
	});
}
