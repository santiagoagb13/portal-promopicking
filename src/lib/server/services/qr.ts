/**
 * QR de versión (5.5, 8.7). Al aprobar las artes, Promopicking genera un código por versión y
 * restaurante; la imprenta lo pone en cada pieza. La landing pública (sin sesión) dice si la
 * versión sigue vigente y permite pedir reposición, avisar de un error o marcarla retirada.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { versionFor } from '$lib/domain/kits';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { db, tables } from '../db';
import { placeQrOrder } from './orders';
import { nextTicketId } from './tickets';

const {
	qrCodes,
	supports,
	supportVersions,
	campaigns,
	brands,
	restaurants,
	kitLines,
	kits,
	tickets,
	ticketUpdates,
	notifications,
	users
} = tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class QrError extends Error {}

/** Alfabeto sin caracteres confusos (0/O, 1/I/L): códigos de 8 en dos grupos, `7KQ4-M2XD`. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function qrCodeFrom(bytes: Uint8Array): string {
	const chars = Array.from(bytes.subarray(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join('');
	return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
export const newQrCode = () => qrCodeFrom(randomBytes(8));
export const REPORT_REASONS = [
	'Versión incorrecta',
	'Precio o texto erróneo',
	'Pieza dañada',
	'Otros'
] as const;
export const QR_CODE_RE = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

/** Genera los códigos que falten de las versiones aprobadas de un soporte (uno por restaurante). */
export async function generateQr(
	actor: Actor,
	supportId: string,
	meta: Meta = {},
	/** Solo el seed: códigos fijos para que los datos de prueba no cambien entre cargas. */
	codeFor: (versionId: string, restaurantId: string) => string = newQrCode
) {
	if (!can(actor, 'artwork.upload')) throw new QrError('Solo Promopicking genera los QR');
	const n = await writeQr(supportId, actor.id, codeFor);
	await audit({
		userId: actor.id,
		action: 'qr.generated',
		entity: 'support',
		entityId: supportId,
		after: { codes: n },
		...meta
	});
	return n;
}

/**
 * Al aprobar la marca la última versión pendiente del soporte, sus QR se generan solos (8.7);
 * «Generar» en /qr queda para restaurantes dados de alta después.
 */
export async function generateQrOnApproval(supportId: string, approverId: string) {
	const [open] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(supportVersions)
		.where(
			and(
				eq(supportVersions.supportId, supportId),
				isNull(supportVersions.supersededAt),
				ne(supportVersions.status, 'approved')
			)
		);
	if (open?.n) return 0;
	const n = await writeQr(supportId, approverId, newQrCode);
	if (n)
		await audit({
			userId: approverId,
			action: 'qr.generated',
			entity: 'support',
			entityId: supportId,
			after: { codes: n, auto: true }
		});
	return n;
}

async function writeQr(
	supportId: string,
	createdBy: string,
	codeFor: (versionId: string, restaurantId: string) => string
) {
	const [s] = await db
		.select({ id: supports.id, label: supports.artworkLabel, brandCode: campaigns.brandCode })
		.from(supports)
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.where(eq(supports.id, supportId));
	if (!s) throw new QrError('Soporte no encontrado');
	const versions = await db
		.select()
		.from(supportVersions)
		.where(
			and(
				eq(supportVersions.supportId, supportId),
				isNull(supportVersions.supersededAt),
				eq(supportVersions.status, 'approved')
			)
		);
	if (!versions.length) throw new QrError('No hay versiones aprobadas');
	// Destino de cada versión: los kits si ya existen; si no, el maestro (tarifa, surtido, idioma).
	const fromKits = await db
		.select({ restaurantId: kits.restaurantId, versionCode: kitLines.versionCode })
		.from(kitLines)
		.innerJoin(kits, eq(kits.id, kitLines.kitId))
		.where(eq(kitLines.supportId, supportId));
	const rests = await db
		.select()
		.from(restaurants)
		.where(and(eq(restaurants.brandCode, s.brandCode), eq(restaurants.active, true)));
	const existing = await db
		.select({ versionId: qrCodes.versionId, restaurantId: qrCodes.restaurantId })
		.from(qrCodes)
		.where(eq(qrCodes.supportId, supportId));
	const batch = s.label ?? new Date().toISOString().slice(0, 7);
	const rows = [];
	for (const r of rests) {
		const code =
			fromKits.find((k) => k.restaurantId === r.id)?.versionCode ?? versionFor(r, versions);
		const v = versions.find((x) => x.code === code);
		if (!v || existing.some((e) => e.versionId === v.id && e.restaurantId === r.id)) continue;
		rows.push({
			code: codeFor(v.id, r.id),
			supportId,
			versionId: v.id,
			versionCode: v.code,
			restaurantId: r.id,
			batch,
			createdBy
		});
	}
	if (rows.length) await db.insert(qrCodes).values(rows).onConflictDoNothing();
	return rows.length;
}

/** Soportes con versiones aprobadas y cuántos QR tienen, para Promopicking. */
export async function qrSupports(actor: Actor) {
	const rows = await db
		.select({
			id: supports.id,
			name: supports.name,
			campaignId: campaigns.id,
			campaignName: campaigns.name,
			brandCode: campaigns.brandCode,
			approved: supportVersions.id
		})
		.from(supports)
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.innerJoin(
			supportVersions,
			and(
				eq(supportVersions.supportId, supports.id),
				eq(supportVersions.status, 'approved'),
				isNull(supportVersions.supersededAt)
			)
		)
		.where(
			and(
				isNull(campaigns.archivedAt),
				actor.role === 'brand' ? inArray(campaigns.brandCode, actor.brands.concat([''])) : undefined
			)
		)
		.orderBy(asc(campaigns.inRestaurantOn));
	const counts = await db
		.select({ supportId: qrCodes.supportId, n: sql<number>`count(*)::int` })
		.from(qrCodes)
		.groupBy(qrCodes.supportId);
	const by = new Map<
		string,
		{
			id: string;
			name: string;
			campaignId: string;
			campaignName: string;
			brandCode: string;
			approved: number;
			codes: number;
		}
	>();
	for (const r of rows) {
		const cur = by.get(r.id) ?? {
			...r,
			approved: 0,
			codes: counts.find((c) => c.supportId === r.id)?.n ?? 0
		};
		cur.approved++;
		by.set(r.id, cur);
	}
	return [...by.values()];
}

export async function qrSheet(actor: Actor, supportId: string) {
	const [s] = await db
		.select({
			id: supports.id,
			name: supports.name,
			campaignName: campaigns.name,
			campaignId: campaigns.id,
			brandCode: campaigns.brandCode
		})
		.from(supports)
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.where(eq(supports.id, supportId));
	if (!s || !can(actor, 'qr.view', { brandCode: s.brandCode })) return null;
	const codes = await db
		.select({
			code: qrCodes.code,
			versionCode: qrCodes.versionCode,
			batch: qrCodes.batch,
			retiredAt: qrCodes.retiredAt,
			restaurantId: qrCodes.restaurantId,
			restaurantName: restaurants.name
		})
		.from(qrCodes)
		.leftJoin(restaurants, eq(restaurants.id, qrCodes.restaurantId))
		.where(eq(qrCodes.supportId, supportId))
		.orderBy(asc(qrCodes.versionCode), asc(qrCodes.restaurantId));
	return { support: s, codes };
}

export type QrLanding = {
	code: string;
	state: 'vigente' | 'sustituida' | 'retirada' | 'pendiente';
	since: Date | null;
	support: string;
	supportId: string;
	versionCode: string;
	campaign: string;
	brand: string;
	restaurantId: string | null;
	restaurant: string | null;
	batch: string;
};

/** Lo que muestra la landing pública: nada sensible (ni precios, ni personas). */
export async function qrLanding(code: string): Promise<QrLanding | null> {
	if (!QR_CODE_RE.test(code)) return null;
	const [q] = await db
		.select({
			code: qrCodes.code,
			retiredAt: qrCodes.retiredAt,
			versionCode: qrCodes.versionCode,
			batch: qrCodes.batch,
			supportId: supports.id,
			support: supports.name,
			campaign: campaigns.name,
			brand: brands.short,
			restaurantId: restaurants.id,
			restaurant: restaurants.name,
			status: supportVersions.status,
			supersededAt: supportVersions.supersededAt
		})
		.from(qrCodes)
		.innerJoin(supports, eq(supports.id, qrCodes.supportId))
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.innerJoin(brands, eq(brands.code, campaigns.brandCode))
		.leftJoin(restaurants, eq(restaurants.id, qrCodes.restaurantId))
		.leftJoin(supportVersions, eq(supportVersions.id, qrCodes.versionId))
		.where(eq(qrCodes.code, code));
	if (!q) return null;
	const state = q.retiredAt
		? 'retirada'
		: q.supersededAt
			? 'sustituida'
			: q.status === 'approved'
				? 'vigente'
				: 'pendiente';
	return {
		code: q.code,
		state,
		since: q.retiredAt ?? q.supersededAt ?? null,
		support: q.support,
		supportId: q.supportId,
		versionCode: q.versionCode,
		campaign: q.campaign,
		brand: q.brand,
		restaurantId: q.restaurantId,
		restaurant: q.restaurant,
		batch: q.batch
	};
}

export async function qrReorder(code: string, qty: number, meta: Meta = {}) {
	const q = await qrLanding(code);
	if (!q || !q.restaurantId) throw new QrError('Código no válido');
	if (!Number.isInteger(qty) || qty < 1 || qty > 50)
		throw new QrError('Pide entre 1 y 50 unidades');
	return placeQrOrder(
		{
			restaurantId: q.restaurantId,
			supportId: q.supportId,
			versionCode: q.versionCode,
			label: q.support,
			qty,
			qrCode: code
		},
		meta
	);
}

/** «Avisar de error»: consulta de soporte con el lote, el restaurante y el motivo. */
export async function qrReport(code: string, reason: string, text: string, meta: Meta = {}) {
	const q = await qrLanding(code);
	if (!q) throw new QrError('Código no válido');
	const [s] = await db
		.select({ campaignId: supports.campaignId })
		.from(supports)
		.where(eq(supports.id, q.supportId));
	const id = await db.transaction(async (tx) => {
		const id = await nextTicketId(tx as unknown as typeof db, 'CON');
		await tx.insert(tickets).values({
			id,
			campaignId: s?.campaignId ?? null,
			restaurantId: q.restaurantId,
			type: 'query',
			kind: reason,
			title: `${reason} · ${q.support} ${q.versionCode}${q.restaurant ? ` · ${q.restaurant}` : ''}`,
			severity: 'medium',
			state: 'open',
			openedByLabel: `QR ${code}`,
			openedAt: new Date()
		});
		if (text.trim())
			await tx.insert(ticketUpdates).values({
				ticketId: id,
				at: new Date(),
				authorLabel: `QR ${code}`,
				text: text.trim().slice(0, 1000)
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
				kind: 'qr.report',
				title: `${id} desde QR · ${reason}`,
				entity: 'ticket',
				entityId: id,
				href: '/soporte'
			}))
		);
	await audit({
		action: 'qr.reported',
		entity: 'qr',
		entityId: code,
		after: { ticket: id, reason },
		...meta
	});
	return id;
}

export async function qrRetire(code: string, meta: Meta = {}) {
	const q = await qrLanding(code);
	if (!q) throw new QrError('Código no válido');
	if (q.state === 'retirada') return;
	await db.update(qrCodes).set({ retiredAt: new Date() }).where(eq(qrCodes.code, code));
	await audit({ action: 'qr.retired', entity: 'qr', entityId: code, ...meta });
}
