/**
 * Administración de usuarios (5.4 y 8.12): rol y ámbito, suspender, eliminar (anonimizando).
 * Cualquier cambio de privilegios cierra todas las sesiones de la persona (4.3).
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { can, type Actor, type Role } from '$lib/permissions';
import { ROLE_ORG } from '$lib/i18n/es';
import { audit } from '../audit';
import { loadActor } from '../auth/actor';
import { db, tables } from '../db';
import { describeAccess } from './invitations';

const { users, userBrands, userRestaurants, restaurants, sessions, passkeys, auditLog, brands } =
	tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class UserAdminError extends Error {}

/** Lo que puede tocar el actor de una cuenta: admin, todo; marca, gerentes de sus marcas. */
async function manageable(actor: Actor, userId: string) {
	if (userId === actor.id)
		throw new UserAdminError('No puedes cambiar tu propia cuenta desde aquí');
	const target = await loadActor(userId);
	if (!target || target.status === 'deleted') throw new UserAdminError('Usuario no encontrado');
	const ok =
		actor.role === 'admin' ||
		(target.role === 'manager' &&
			can(actor, 'user.changeRole', {
				targetRole: 'manager',
				targetRestaurantBrands: [...new Set(target.restaurants.map((r) => r.brandCode))]
			}));
	if (!ok) throw new UserAdminError('No puedes gestionar esta cuenta');
	return target;
}

async function ensureAnotherAdmin(userId: string) {
	const [{ n } = { n: 0 }] = await db
		.select({ n: count() })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, userId)));
	if (n === 0)
		throw new UserAdminError('Tiene que quedar al menos otra cuenta de administración activa');
}

export async function listUsers(actor: Actor) {
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			status: users.status,
			lastSeenAt: users.lastSeenAt,
			createdAt: users.createdAt
		})
		.from(users)
		.where(
			and(
				ne(users.status, 'deleted'),
				actor.role === 'admin'
					? undefined
					: and(
							eq(users.role, 'manager'),
							sql`exists (select 1 from ${userRestaurants} ur join ${restaurants} r on r.id = ur.restaurant_id
								where ur.user_id = ${users.id} and r.brand_code in ${actor.brands.length ? actor.brands : ['']})`
						)
			)
		)
		.orderBy(asc(users.role), asc(users.name));
	const ids = rows.map((r) => r.id);
	const [b, r] = ids.length
		? await Promise.all([
				db.select().from(userBrands).where(inArray(userBrands.userId, ids)),
				db.select().from(userRestaurants).where(inArray(userRestaurants.userId, ids))
			])
		: [[], []];
	return Promise.all(
		rows.map(async (u) => {
			const scope = {
				brands: b.filter((x) => x.userId === u.id).map((x) => x.brandCode),
				restaurants: r.filter((x) => x.userId === u.id).map((x) => x.restaurantId)
			};
			return { ...u, scope, access: await describeAccess(u.role, scope), self: u.id === actor.id };
		})
	);
}

export type AccessInput = { role: Role; brands: string[]; restaurants: string[] };

/** Cambia rol y ámbito. Cierra sus sesiones para que el cambio rija ya. */
export async function updateAccess(
	actor: Actor,
	userId: string,
	input: AccessInput,
	meta: Meta = {}
) {
	const target = await manageable(actor, userId);
	const scope = {
		brands: input.role === 'brand' ? [...new Set(input.brands)] : [],
		restaurants: input.role === 'manager' ? [...new Set(input.restaurants)] : []
	};
	if (input.role === 'brand' && !scope.brands.length)
		throw new UserAdminError('Elige al menos una marca');
	if (input.role === 'manager' && !scope.restaurants.length)
		throw new UserAdminError('Elige al menos un restaurante');
	const rest = scope.restaurants.length
		? await db
				.select({ id: restaurants.id, brandCode: restaurants.brandCode })
				.from(restaurants)
				.where(inArray(restaurants.id, scope.restaurants))
		: [];
	if (rest.length !== scope.restaurants.length) throw new UserAdminError('Restaurante desconocido');
	if (scope.brands.length) {
		const found = await db
			.select({ code: brands.code })
			.from(brands)
			.where(inArray(brands.code, scope.brands));
		if (found.length !== scope.brands.length) throw new UserAdminError('Marca desconocida');
	}
	if (
		!can(actor, 'user.changeRole', {
			targetRole: input.role,
			targetBrands: scope.brands,
			targetRestaurantBrands: rest.map((x) => x.brandCode)
		})
	)
		throw new UserAdminError('No puedes asignar ese rol o ámbito');
	if (target.role === 'admin' && input.role !== 'admin') await ensureAnotherAdmin(userId);

	const before = {
		role: target.role,
		brands: target.brands,
		restaurants: target.restaurants.map((x) => x.id)
	};
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ role: input.role, organization: ROLE_ORG[input.role], updatedAt: new Date() })
			.where(eq(users.id, userId));
		await tx.delete(userBrands).where(eq(userBrands.userId, userId));
		await tx.delete(userRestaurants).where(eq(userRestaurants.userId, userId));
		if (scope.brands.length)
			await tx.insert(userBrands).values(scope.brands.map((brandCode) => ({ userId, brandCode })));
		if (scope.restaurants.length)
			await tx
				.insert(userRestaurants)
				.values(scope.restaurants.map((restaurantId) => ({ userId, restaurantId })));
		await tx.delete(sessions).where(eq(sessions.userId, userId));
	});
	await audit({
		userId: actor.id,
		action: 'user.role_changed',
		entity: 'user',
		entityId: userId,
		before,
		after: { role: input.role, ...scope },
		...meta
	});
}

export async function setSuspended(
	actor: Actor,
	userId: string,
	suspended: boolean,
	meta: Meta = {}
) {
	const target = await manageable(actor, userId);
	if (suspended && target.role === 'admin') await ensureAnotherAdmin(userId);
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ status: suspended ? 'suspended' : 'active', updatedAt: new Date() })
			.where(eq(users.id, userId));
		if (suspended) await tx.delete(sessions).where(eq(sessions.userId, userId));
	});
	await audit({
		userId: actor.id,
		action: suspended ? 'user.suspended' : 'user.reactivated',
		entity: 'user',
		entityId: userId,
		...meta
	});
}

/**
 * Eliminar (RGPD): se borran sesiones, passkeys y ámbito, y la fila se anonimiza en lugar de
 * borrarse. Las entradas de auditoría siguen apuntando al mismo id, que ya no identifica a nadie.
 */
export async function deleteUser(actor: Actor, userId: string, meta: Meta = {}) {
	const target = await manageable(actor, userId);
	if (target.role === 'admin') await ensureAnotherAdmin(userId);
	await db.transaction(async (tx) => {
		await tx.delete(sessions).where(eq(sessions.userId, userId));
		await tx.delete(passkeys).where(eq(passkeys.userId, userId));
		await tx.delete(userBrands).where(eq(userBrands.userId, userId));
		await tx.delete(userRestaurants).where(eq(userRestaurants.userId, userId));
		await tx
			.update(users)
			.set({
				status: 'deleted',
				name: 'Cuenta eliminada',
				email: `eliminada-${userId}@invalid`,
				image: null,
				updatedAt: new Date()
			})
			.where(eq(users.id, userId));
	});
	await audit({
		userId: actor.id,
		action: 'user.deleted',
		entity: 'user',
		entityId: userId,
		before: { role: target.role },
		...meta
	});
}

/* ---------- Auditoría ---------- */

export type AuditFilters = {
	userId?: string;
	action?: string;
	entity?: string;
	from?: string;
	to?: string;
};
export const AUDIT_PAGE = 50;

const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Filtros de la URL (`?usuario=&accion=&entidad=&desde=&hasta=`), compartidos por la página y el CSV. */
export function auditFiltersFrom(sp: URLSearchParams): AuditFilters {
	return {
		userId: sp.get('usuario') || undefined,
		action: sp.get('accion')?.slice(0, 60) || undefined,
		entity: sp.get('entidad')?.slice(0, 80) || undefined,
		from: day(sp.get('desde')),
		to: day(sp.get('hasta'))
	};
}

function auditWhere(f: AuditFilters) {
	return and(
		f.userId ? eq(auditLog.userId, f.userId) : undefined,
		f.action ? ilike(auditLog.action, `${f.action}%`) : undefined,
		f.entity ? or(eq(auditLog.entity, f.entity), eq(auditLog.entityId, f.entity)) : undefined,
		f.from ? gte(auditLog.at, new Date(`${f.from}T00:00:00`)) : undefined,
		f.to ? lte(auditLog.at, new Date(`${f.to}T23:59:59.999`)) : undefined
	);
}

export async function listAudit(f: AuditFilters, page = 1, limit = AUDIT_PAGE) {
	const where = auditWhere(f);
	const [rows, [{ n } = { n: 0 }]] = await Promise.all([
		db
			.select({
				id: auditLog.id,
				at: auditLog.at,
				userId: auditLog.userId,
				userName: users.name,
				action: auditLog.action,
				entity: auditLog.entity,
				entityId: auditLog.entityId,
				before: auditLog.before,
				after: auditLog.after,
				ip: auditLog.ip
			})
			.from(auditLog)
			.leftJoin(users, eq(users.id, auditLog.userId))
			.where(where)
			.orderBy(desc(auditLog.at), desc(auditLog.id))
			.limit(limit)
			.offset((page - 1) * limit),
		db.select({ n: count() }).from(auditLog).where(where)
	]);
	return { rows, total: n };
}

export async function auditActions() {
	const rows = await db
		.selectDistinct({ action: auditLog.action })
		.from(auditLog)
		.orderBy(asc(auditLog.action));
	return rows.map((r) => r.action);
}
