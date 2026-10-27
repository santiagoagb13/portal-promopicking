import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { can, type Actor, type Role } from '$lib/permissions';
import { ROLE_LABEL, ROLE_ORG } from '$lib/i18n/es';
import type { InvitationInput } from '$lib/schemas/invitation';
import { fmtDateTime } from '$lib/domain/dates';
import { audit } from '../audit';
import { config } from '../config';
import { currentDb, db, tables } from '../db';
import type { DbOrTx } from '../db/client';
import { sendMail } from '../mail';
import { invitationMail } from '../mail/templates';
import {
	hashToken,
	invitationExpiry,
	invitationState,
	isWellFormedToken,
	newInvitationToken,
	type InvitationState
} from '../auth/invitation-token';

const { invitations, users, brands, restaurants, userBrands, userRestaurants, notifications } =
	tables;

export class InvitationError extends Error {}

type Meta = { ip?: string | null; userAgent?: string | null };
type InvitationRow = typeof invitations.$inferSelect;

/** «Gerente · FH Plenilunio», «Marketing de marca · Foster's Hollywood», «Operaciones». */
export async function describeAccess(
	role: Role,
	scope: { brands: string[]; restaurants: string[] },
	tx: DbOrTx = currentDb()
) {
	let names: string[] = [];
	if (scope.restaurants.length) {
		const rows = await tx
			.select({ name: restaurants.name })
			.from(restaurants)
			.where(inArray(restaurants.id, scope.restaurants));
		names = rows.map((r) => r.name);
	} else if (scope.brands.length) {
		const rows = await tx
			.select({ name: brands.name })
			.from(brands)
			.where(inArray(brands.code, scope.brands));
		names = rows.map((r) => r.name);
	}
	return [ROLE_LABEL[role], ...(names.length ? [names.join(', ')] : [])].join(' · ');
}

function inviteUrl(token: string) {
	return `${config.authOrigin}/invitacion/${token}`;
}

/** Comprueba que el ámbito encaja con el rol y devuelve las marcas de los restaurantes. */
async function validateScope(input: InvitationInput) {
	if (input.role === 'brand') {
		if (!input.brands.length) throw new InvitationError('Elige al menos una marca');
		if (input.restaurants.length)
			throw new InvitationError('Un usuario de marca no lleva restaurantes');
		const found = await db
			.select({ code: brands.code })
			.from(brands)
			.where(inArray(brands.code, input.brands));
		if (found.length !== new Set(input.brands).size) throw new InvitationError('Marca desconocida');
		return [];
	}
	if (input.role === 'manager') {
		if (!input.restaurants.length) throw new InvitationError('Elige al menos un restaurante');
		if (input.brands.length) throw new InvitationError('Un gerente no lleva marcas');
		const found = await db
			.select({ id: restaurants.id, brandCode: restaurants.brandCode })
			.from(restaurants)
			.where(inArray(restaurants.id, input.restaurants));
		if (found.length !== new Set(input.restaurants).size)
			throw new InvitationError('Restaurante desconocido');
		return [...new Set(found.map((r) => r.brandCode))];
	}
	if (input.brands.length || input.restaurants.length)
		throw new InvitationError('Este rol no lleva ámbito de marca ni de restaurante');
	return [];
}

async function inviterName(id: string | null) {
	if (!id) return 'Promopicking';
	const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id));
	return u?.name ?? 'Promopicking';
}

async function mailInvitation(inv: InvitationRow, token: string) {
	await sendMail(
		invitationMail({
			to: inv.email,
			inviter: await inviterName(inv.invitedBy),
			roleLabel: await describeAccess(inv.role, inv.scope),
			url: inviteUrl(token),
			expiresOn: fmtDateTime(inv.expiresAt)
		})
	);
}

export async function createInvitation(
	actor: Actor,
	input: InvitationInput,
	meta: Meta = {},
	opts: { sendMail?: boolean } = {}
) {
	const restaurantBrands = await validateScope(input);
	if (
		!can(actor, 'user.invite', {
			targetRole: input.role,
			targetBrands: input.brands,
			targetRestaurantBrands: restaurantBrands
		})
	)
		throw new InvitationError('No puedes invitar con ese rol o ámbito');

	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, input.email));
	if (existing) throw new InvitationError('Ya existe una cuenta con ese correo');
	const [pending] = await db
		.select({ id: invitations.id })
		.from(invitations)
		.where(
			and(
				eq(invitations.email, input.email),
				isNull(invitations.usedAt),
				isNull(invitations.revokedAt),
				gt(invitations.expiresAt, new Date())
			)
		);
	if (pending) throw new InvitationError('Ya hay una invitación pendiente para ese correo');

	const token = newInvitationToken();
	const [inv] = await db
		.insert(invitations)
		.values({
			id: randomUUID(),
			email: input.email,
			name: input.name || null,
			role: input.role,
			scope: { brands: input.brands, restaurants: input.restaurants },
			tokenHash: hashToken(token),
			invitedBy: actor.id,
			expiresAt: invitationExpiry()
		})
		.returning();
	if (opts.sendMail !== false) await mailInvitation(inv!, token);
	await audit({
		userId: actor.id,
		action: 'invitation.created',
		entity: 'invitation',
		entityId: inv!.id,
		after: { email: inv!.email, role: inv!.role, scope: inv!.scope },
		...meta
	});
	return { id: inv!.id, token };
}

/** Admin: todas. Marca: las que ha enviado y las de gerentes de sus marcas. */
async function manageable(actor: Actor, id: string) {
	const [inv] = await db.select().from(invitations).where(eq(invitations.id, id));
	if (!inv) throw new InvitationError('Invitación no encontrada');
	if (actor.role === 'admin' || inv.invitedBy === actor.id) return inv;
	if (actor.role === 'brand' && inv.role === 'manager') {
		const rows = await db
			.select({ brandCode: restaurants.brandCode })
			.from(restaurants)
			.where(inArray(restaurants.id, inv.scope.restaurants));
		if (
			can(actor, 'user.invite', {
				targetRole: 'manager',
				targetRestaurantBrands: rows.map((r) => r.brandCode)
			})
		)
			return inv;
	}
	throw new InvitationError('No puedes gestionar esta invitación');
}

/** Reenviar: token nuevo (el anterior deja de valer) y caducidad renovada. */
export async function resendInvitation(actor: Actor, id: string, meta: Meta = {}) {
	const inv = await manageable(actor, id);
	if (inv.usedAt || inv.revokedAt) throw new InvitationError('La invitación ya no está pendiente');
	const token = newInvitationToken();
	const [updated] = await db
		.update(invitations)
		.set({ tokenHash: hashToken(token), expiresAt: invitationExpiry(), sentAt: new Date() })
		.where(eq(invitations.id, id))
		.returning();
	await mailInvitation(updated!, token);
	await audit({
		userId: actor.id,
		action: 'invitation.resent',
		entity: 'invitation',
		entityId: id,
		...meta
	});
	return { token };
}

export async function revokeInvitation(actor: Actor, id: string, meta: Meta = {}) {
	const inv = await manageable(actor, id);
	if (inv.usedAt || inv.revokedAt) throw new InvitationError('La invitación ya no está pendiente');
	await db
		.update(invitations)
		.set({ revokedAt: new Date(), revokedBy: actor.id })
		.where(eq(invitations.id, id));
	await audit({
		userId: actor.id,
		action: 'invitation.revoked',
		entity: 'invitation',
		entityId: id,
		before: { email: inv.email, role: inv.role },
		...meta
	});
}

/** Invitaciones sin usar ni revocar (también las caducadas, para poder reenviarlas). */
export async function listOpenInvitations(actor: Actor) {
	const rows = await db
		.select({
			id: invitations.id,
			email: invitations.email,
			name: invitations.name,
			role: invitations.role,
			scope: invitations.scope,
			invitedBy: invitations.invitedBy,
			inviterName: users.name,
			sentAt: invitations.sentAt,
			expiresAt: invitations.expiresAt,
			usedAt: invitations.usedAt,
			revokedAt: invitations.revokedAt
		})
		.from(invitations)
		.leftJoin(users, eq(users.id, invitations.invitedBy))
		.where(
			and(
				isNull(invitations.usedAt),
				isNull(invitations.revokedAt),
				actor.role === 'admin'
					? sql`true`
					: or(
							eq(invitations.invitedBy, actor.id),
							and(
								eq(invitations.role, 'manager'),
								sql`exists (select 1 from ${restaurants} r where r.id in (select jsonb_array_elements_text(${invitations.scope}->'restaurants')) and r.brand_code in ${actor.brands.length ? actor.brands : ['']})`
							)
						)
			)
		)
		.orderBy(desc(invitations.sentAt));
	return Promise.all(
		rows.map(async (r) => ({
			...r,
			state: invitationState(r),
			access: await describeAccess(r.role, r.scope)
		}))
	);
}

export type InvitationView = {
	id: string;
	state: InvitationState;
	email: string;
	name: string | null;
	role: Role;
	access: string;
	inviter: string;
	invitedBy: string | null;
	expiresAt: Date;
};

/** Busca la invitación de un token. `null` si el token no existe o está mal formado. */
export async function findInvitationByToken(token: string): Promise<InvitationView | null> {
	if (!isWellFormedToken(token)) return null;
	const [inv] = await db
		.select()
		.from(invitations)
		.where(eq(invitations.tokenHash, hashToken(token)));
	if (!inv) return null;
	return {
		id: inv.id,
		state: invitationState(inv),
		email: inv.email,
		name: inv.name,
		role: inv.role,
		access: await describeAccess(inv.role, inv.scope),
		inviter: await inviterName(inv.invitedBy),
		invitedBy: inv.invitedBy,
		expiresAt: inv.expiresAt
	};
}

/**
 * Acepta la invitación: crea la cuenta con su ámbito y marca la invitación como usada. Se llama
 * dentro de la transacción en la que Better Auth guarda la passkey y abre la sesión, de modo que
 * o se hace todo o nada.
 */
export async function acceptInvitation(
	p: { token: string; userId: string; name: string } & Meta,
	tx: DbOrTx = currentDb()
) {
	if (!isWellFormedToken(p.token)) throw new InvitationError('Invitación no válida');
	const [inv] = await tx
		.select()
		.from(invitations)
		.where(eq(invitations.tokenHash, hashToken(p.token)))
		.for('update');
	if (!inv || invitationState(inv) !== 'pending')
		throw new InvitationError('La invitación no está disponible');
	const [existing] = await tx
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, inv.email));
	if (existing) throw new InvitationError('Ya existe una cuenta con ese correo');

	const name = p.name.trim() || inv.name || inv.email;
	await tx.insert(users).values({
		id: p.userId,
		email: inv.email,
		name,
		emailVerified: true,
		role: inv.role,
		organization: ROLE_ORG[inv.role]
	});
	if (inv.scope.brands.length)
		await tx
			.insert(userBrands)
			.values(inv.scope.brands.map((brandCode) => ({ userId: p.userId, brandCode })));
	if (inv.scope.restaurants.length)
		await tx
			.insert(userRestaurants)
			.values(inv.scope.restaurants.map((restaurantId) => ({ userId: p.userId, restaurantId })));
	await tx
		.update(invitations)
		.set({ usedAt: new Date(), usedByUserId: p.userId })
		.where(eq(invitations.id, inv.id));
	if (inv.invitedBy)
		await tx.insert(notifications).values({
			id: randomUUID(),
			userId: inv.invitedBy,
			kind: 'invitation.accepted',
			title: `${name} ha aceptado la invitación`,
			entity: 'user',
			entityId: p.userId,
			href: '/admin/invitaciones'
		});
	await audit({
		userId: p.userId,
		action: 'invitation.accepted',
		entity: 'invitation',
		entityId: inv.id,
		after: { email: inv.email, role: inv.role, scope: inv.scope, invitedBy: inv.invitedBy },
		ip: p.ip,
		userAgent: p.userAgent
	});
	return { userId: p.userId, email: inv.email, role: inv.role };
}

/** La persona invitada pide una invitación nueva porque la suya caducó: se avisa a quien invitó. */
export async function requestNewInvitation(token: string, meta: Meta = {}) {
	const inv = await findInvitationByToken(token);
	if (!inv || inv.state !== 'expired' || !inv.invitedBy) return;
	await db.insert(notifications).values({
		id: randomUUID(),
		userId: inv.invitedBy,
		kind: 'invitation.expired',
		title: `${inv.name ?? inv.email} pide una invitación nueva`,
		entity: 'invitation',
		entityId: inv.id,
		href: '/admin/invitaciones'
	});
	await audit({
		action: 'invitation.renewal_requested',
		entity: 'invitation',
		entityId: inv.id,
		...meta
	});
}

/**
 * Primer administrador de un entorno vacío (`npm run invitar-admin`). Solo funciona mientras no
 * haya ningún admin activo: a partir de ahí las invitaciones salen del portal.
 */
export async function bootstrapAdminInvitation(
	email: string,
	name: string,
	opts: { sendMail?: boolean } = {}
) {
	const [admin] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
		.limit(1);
	if (admin) throw new InvitationError('Ya hay un administrador: invita desde el portal');
	const token = newInvitationToken();
	const [inv] = await db
		.insert(invitations)
		.values({
			id: randomUUID(),
			email: email.trim().toLowerCase(),
			name: name.trim() || null,
			role: 'admin',
			scope: { brands: [], restaurants: [] },
			tokenHash: hashToken(token),
			invitedBy: null,
			expiresAt: invitationExpiry()
		})
		.returning();
	if (opts.sendMail !== false) await mailInvitation(inv!, token);
	await audit({
		action: 'invitation.bootstrap',
		entity: 'invitation',
		entityId: inv!.id,
		after: { email: inv!.email }
	});
	return { token, url: inviteUrl(token) };
}
