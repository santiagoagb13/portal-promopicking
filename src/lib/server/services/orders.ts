/**
 * Reposiciones (8.8): catálogo por restaurante, pedidos, validación de los que llegan desde el QR
 * y avance de estado (preparación → reparto → entregado).
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { MAX_LINE_QTY, type OrderState } from '$lib/domain/orders';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { db, tables } from '../db';

const {
	orders,
	orderLines,
	catalogItems,
	restaurants,
	brands,
	users,
	notifications,
	userRestaurants
} = tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class OrderError extends Error {}

export { ORDER_STATE_LABEL, type OrderState } from '$lib/domain/orders';

function restaurantScope(actor: Actor): SQL | undefined {
	if (actor.role === 'manager')
		return inArray(restaurants.id, actor.restaurants.map((r) => r.id).concat(['']));
	if (actor.role === 'brand') return inArray(restaurants.brandCode, actor.brands.concat(['']));
	return undefined;
}

/** Restaurantes para los que el actor puede pedir. */
export async function orderRestaurants(actor: Actor) {
	if (!can(actor, 'order.place')) return [];
	return db
		.select({
			id: restaurants.id,
			name: restaurants.name,
			address: restaurants.address,
			city: restaurants.city,
			brandCode: restaurants.brandCode,
			brandShort: brands.short
		})
		.from(restaurants)
		.innerJoin(brands, eq(brands.code, restaurants.brandCode))
		.where(and(eq(restaurants.active, true), restaurantScope(actor)))
		.orderBy(asc(restaurants.brandCode), asc(restaurants.name));
}

export async function catalogFor(brandCode: string) {
	return db
		.select()
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.active, true),
				or(isNull(catalogItems.brandCode), eq(catalogItems.brandCode, brandCode))
			)
		)
		.orderBy(asc(catalogItems.category), asc(catalogItems.name));
}

async function nextOrderId(tx: typeof db, year: number) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('order-id'))`);
	const [row] = await tx
		.select({ max: sql<number | null>`max(substring(${orders.id} from 10)::int)` })
		.from(orders)
		.where(sql`${orders.id} like ${`REP-${year}-%`}`);
	return `REP-${year}-${String((row?.max ?? 300) + 1).padStart(4, '0')}`;
}

async function notifyOps(title: string, entityId: string, exclude?: string) {
	const ops = await db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.role, ['ops', 'admin']), eq(users.status, 'active')));
	const ids = ops.map((u) => u.id).filter((id) => id !== exclude);
	if (ids.length)
		await db.insert(notifications).values(
			ids.map((userId) => ({
				id: randomUUID(),
				userId,
				kind: 'order',
				title,
				entity: 'order',
				entityId,
				href: `/reposiciones/pedidos/${entityId}`
			}))
		);
}

async function notifyRestaurant(restaurantId: string, title: string, entityId: string) {
	const managers = await db
		.select({ id: users.id })
		.from(userRestaurants)
		.innerJoin(users, eq(users.id, userRestaurants.userId))
		.where(and(eq(userRestaurants.restaurantId, restaurantId), eq(users.status, 'active')));
	if (managers.length)
		await db.insert(notifications).values(
			managers.map((m) => ({
				id: randomUUID(),
				userId: m.id,
				kind: 'order',
				title,
				entity: 'order',
				entityId,
				href: `/reposiciones/pedidos/${entityId}`
			}))
		);
}

/** Pedido desde el portal: precios del catálogo en ese momento; nace «En preparación». */
export async function placeOrder(
	actor: Actor,
	restaurantId: string,
	lines: { itemId: string; qty: number }[],
	note: string | null,
	meta: Meta = {}
) {
	const [r] = await db
		.select()
		.from(restaurants)
		.where(and(eq(restaurants.id, restaurantId), eq(restaurants.active, true)));
	if (!r) throw new OrderError('Restaurante no encontrado');
	if (!can(actor, 'order.place', { restaurantId, brandCode: r.brandCode }))
		throw new OrderError('No puedes pedir para este restaurante');
	const wanted = lines.filter((l) => l.qty > 0);
	if (!wanted.length) throw new OrderError('Añade al menos un artículo');
	if (wanted.some((l) => !Number.isInteger(l.qty) || l.qty > MAX_LINE_QTY))
		throw new OrderError('Cantidad no válida');
	const catalog = await catalogFor(r.brandCode);
	const priced = wanted.map((l) => {
		const item = catalog.find((c) => c.id === l.itemId);
		if (!item) throw new OrderError('Artículo no disponible para este restaurante');
		return {
			itemId: item.id,
			label: item.name,
			qty: l.qty,
			unitPriceCents: item.priceCents,
			leadDays: item.leadDays
		};
	});
	const id = await db.transaction(async (tx) => {
		const id = await nextOrderId(tx as unknown as typeof db, new Date().getFullYear());
		await tx.insert(orders).values({
			id,
			restaurantId,
			placedBy: actor.id,
			placedAt: new Date(),
			state: 'preparing',
			source: 'web',
			note: note?.trim().slice(0, 500) || null
		});
		await tx
			.insert(orderLines)
			.values(priced.map(({ leadDays: _l, ...p }) => ({ orderId: id, ...p })));
		return id;
	});
	const total = priced.reduce((n, p) => n + p.qty * p.unitPriceCents, 0);
	await notifyOps(
		`${id} · ${r.name} · ${(total / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
		id,
		actor.id
	);
	await audit({
		userId: actor.id,
		action: 'order.placed',
		entity: 'order',
		entityId: id,
		after: { restaurantId, lines: priced.map((p) => `${p.qty} × ${p.itemId}`), total },
		...meta
	});
	return { id, total, leadDays: Math.max(...priced.map((p) => p.leadDays)) };
}

/** Pedido desde el QR público: nace «Pendiente de validar» hasta que Operaciones lo confirme (5.5). */
export async function placeQrOrder(
	p: {
		restaurantId: string;
		supportId: string;
		versionCode: string;
		label: string;
		qty: number;
		qrCode: string;
	},
	meta: Meta = {}
) {
	const id = await db.transaction(async (tx) => {
		const id = await nextOrderId(tx as unknown as typeof db, new Date().getFullYear());
		await tx.insert(orders).values({
			id,
			restaurantId: p.restaurantId,
			placedAt: new Date(),
			state: 'pending_validation',
			source: 'qr',
			qrCode: p.qrCode
		});
		await tx.insert(orderLines).values({
			orderId: id,
			supportId: p.supportId,
			versionCode: p.versionCode,
			label: p.label,
			qty: p.qty,
			unitPriceCents: 0
		});
		return id;
	});
	await notifyOps(`${id} desde QR · pendiente de validar`, id);
	await audit({
		action: 'order.qr_placed',
		entity: 'order',
		entityId: id,
		after: { ...p },
		...meta
	});
	return id;
}

const orderSelect = {
	id: orders.id,
	restaurantId: orders.restaurantId,
	restaurantName: restaurants.name,
	brandCode: restaurants.brandCode,
	placedAt: orders.placedAt,
	placedBy: users.name,
	placedById: orders.placedBy,
	note: orders.note,
	state: orders.state,
	source: orders.source,
	reason: orders.reason,
	qrCode: orders.qrCode,
	validatedAt: orders.validatedAt,
	shippedAt: orders.shippedAt,
	deliveredAt: orders.deliveredAt,
	cancelledAt: orders.cancelledAt,
	total: sql<number>`(select coalesce(sum(l.qty * l.unit_price_cents), 0)::int from ${orderLines} l where l.order_id = "orders"."id")`,
	lines: sql<number>`(select count(*)::int from ${orderLines} l where l.order_id = "orders"."id")`
};

export async function listOrders(
	actor: Actor,
	opts: { restaurantId?: string; state?: OrderState } = {}
) {
	return db
		.select(orderSelect)
		.from(orders)
		.innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
		.leftJoin(users, eq(users.id, orders.placedBy))
		.where(
			and(
				restaurantScope(actor),
				opts.restaurantId ? eq(orders.restaurantId, opts.restaurantId) : undefined,
				opts.state ? eq(orders.state, opts.state) : undefined
			)
		)
		.orderBy(desc(orders.placedAt))
		.limit(100);
}

export async function getOrder(actor: Actor, id: string) {
	const [o] = await db
		.select(orderSelect)
		.from(orders)
		.innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
		.leftJoin(users, eq(users.id, orders.placedBy))
		.where(and(eq(orders.id, id), restaurantScope(actor)));
	if (!o) return null;
	const lines = await db
		.select({
			id: orderLines.id,
			label: sql<string>`coalesce(${orderLines.label}, ${catalogItems.name})`,
			unit: catalogItems.unit,
			versionCode: orderLines.versionCode,
			qty: orderLines.qty,
			unitPriceCents: orderLines.unitPriceCents
		})
		.from(orderLines)
		.leftJoin(catalogItems, eq(catalogItems.id, orderLines.itemId))
		.where(eq(orderLines.orderId, id))
		.orderBy(asc(orderLines.id));
	return { ...o, lines };
}

const internal = (a: Actor) => a.role === 'admin' || a.role === 'ops';

/** Validar (o rechazar con motivo) un pedido del QR: solo Promopicking. */
export async function validateOrder(
	actor: Actor,
	id: string,
	accept: boolean,
	reason: string | null,
	meta: Meta = {}
) {
	if (!internal(actor)) throw new OrderError('Solo Promopicking valida pedidos');
	const o = await getOrder(actor, id);
	if (!o || o.state !== 'pending_validation')
		throw new OrderError('El pedido no está pendiente de validar');
	if (!accept && (reason ?? '').trim().length < 3)
		throw new OrderError('Explica por qué se rechaza');
	await db
		.update(orders)
		.set(
			accept
				? { state: 'preparing', validatedBy: actor.id, validatedAt: new Date() }
				: { state: 'cancelled', cancelledAt: new Date(), reason: reason!.trim() }
		)
		.where(eq(orders.id, id));
	await notifyRestaurant(
		o.restaurantId,
		accept ? `${id} validado: en preparación` : `${id} rechazado: ${reason}`,
		id
	);
	await audit({
		userId: actor.id,
		action: accept ? 'order.validated' : 'order.rejected',
		entity: 'order',
		entityId: id,
		after: { reason },
		...meta
	});
}

/** Avance de Operaciones: en preparación → en reparto → entregado. */
export async function advanceOrder(actor: Actor, id: string, meta: Meta = {}) {
	if (!internal(actor)) throw new OrderError('Solo Promopicking cambia el estado de los pedidos');
	const o = await getOrder(actor, id);
	if (!o) throw new OrderError('Pedido no encontrado');
	const next = o.state === 'preparing' ? 'shipping' : o.state === 'shipping' ? 'delivered' : null;
	if (!next) throw new OrderError('Este pedido no puede avanzar');
	await db
		.update(orders)
		.set(
			next === 'shipping'
				? { state: 'shipping', shippedAt: new Date() }
				: { state: 'delivered', deliveredAt: new Date() }
		)
		.where(eq(orders.id, id));
	await notifyRestaurant(
		o.restaurantId,
		`${id} ${next === 'shipping' ? 'sale a reparto' : 'entregado'}`,
		id
	);
	await audit({
		userId: actor.id,
		action: `order.${next}`,
		entity: 'order',
		entityId: id,
		...meta
	});
	return next;
}

/** Cancelar: solo en preparación, quien lo pidió o Promopicking. */
export async function cancelOrder(actor: Actor, id: string, meta: Meta = {}) {
	const o = await getOrder(actor, id);
	if (!o) throw new OrderError('Pedido no encontrado');
	if (o.state !== 'preparing' && o.state !== 'pending_validation')
		throw new OrderError('Solo se cancela antes de salir a reparto');
	const [placed] = await db
		.select({ placedBy: orders.placedBy })
		.from(orders)
		.where(eq(orders.id, id));
	if (!internal(actor) && placed?.placedBy !== actor.id)
		throw new OrderError('Solo puede cancelarlo quien lo pidió');
	await db
		.update(orders)
		.set({ state: 'cancelled', cancelledAt: new Date(), reason: 'Cancelado por el cliente' })
		.where(eq(orders.id, id));
	await audit({
		userId: actor.id,
		action: 'order.cancelled',
		entity: 'order',
		entityId: id,
		...meta
	});
}
