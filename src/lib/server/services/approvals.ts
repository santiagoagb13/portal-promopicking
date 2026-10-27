/**
 * Aprobación de artes finales (8.5): soportes con versiones, visor, decisiones con registro,
 * comentarios anclados, subida de PDF y avisos.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { codeKey, parseArtworkFilename, UNDO_SECONDS } from '$lib/domain/artwork';
import { parseVersionCode } from '$lib/domain/version-code';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { deviceLabel } from '../auth/device';
import { db, tables } from '../db';
import type { PageImage } from '../db/schema';
import { isPdf, MAX_PDF_BYTES, PAGE_WIDTHS, renderPages, sha256 } from '../pdf';
import { fileStorage } from '../storage';
import { campaignScope } from './campaigns';
import { generateQrOnApproval } from './qr';

const {
	supports,
	supportVersions,
	campaigns,
	brands,
	users,
	versionComments,
	versionDecisions,
	artworkUploads,
	artworkUploadItems,
	notifications,
	userBrands
} = tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class ApprovalError extends Error {}

export const STATUS_LABEL = {
	pending: 'Pendiente',
	approved: 'Aprobada',
	changes: 'Cambios pedidos'
} as const;

/** Solo la última revisión de cada código cuenta (las sustituidas quedan para comparar). */
const current = isNull(supportVersions.supersededAt);

/* ---------- Lectura ---------- */

/** Soportes con artes en el ámbito del actor, con sus pendientes. */
export async function listApprovalSupports(actor: Actor) {
	if (!can(actor, 'artwork.view')) return [];
	const rows = await db
		.select({
			id: supports.id,
			name: supports.name,
			stage: supports.stage,
			campaignId: campaigns.id,
			campaignName: campaigns.name,
			brandCode: campaigns.brandCode,
			inRestaurantOn: campaigns.inRestaurantOn,
			total: sql<number>`count(${supportVersions.id})::int`,
			pending: sql<number>`count(*) filter (where ${supportVersions.status} <> 'approved')::int`,
			waiting: sql<number>`count(*) filter (where ${supportVersions.status} = 'pending')::int`
		})
		.from(supportVersions)
		.innerJoin(supports, eq(supports.id, supportVersions.supportId))
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.where(and(current, isNull(campaigns.archivedAt), campaignScope(actor)))
		.groupBy(supports.id, campaigns.id)
		.orderBy(asc(campaigns.inRestaurantOn), asc(supports.position));
	return rows.filter((r) => can(actor, 'artwork.view', { brandCode: r.brandCode }));
}

export async function getSupportForActor(actor: Actor, supportId: string) {
	const [s] = await db
		.select({
			id: supports.id,
			name: supports.name,
			stage: supports.stage,
			artworkFormat: supports.artworkFormat,
			artworkLabel: supports.artworkLabel,
			artworkPrevLabel: supports.artworkPrevLabel,
			campaignId: campaigns.id,
			campaignName: campaigns.name,
			brandCode: campaigns.brandCode,
			brandShort: brands.short
		})
		.from(supports)
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.innerJoin(brands, eq(brands.code, campaigns.brandCode))
		.where(and(eq(supports.id, supportId), campaignScope(actor)));
	if (!s || !can(actor, 'artwork.view', { brandCode: s.brandCode })) return null;
	return s;
}

/** Versiones vigentes de un soporte. */
export async function listVersions(supportId: string) {
	return db
		.select({
			id: supportVersions.id,
			code: supportVersions.code,
			kitsCount: supportVersions.kitsCount,
			status: supportVersions.status,
			revision: supportVersions.revision,
			decidedAt: supportVersions.decidedAt,
			decidedBy: users.name
		})
		.from(supportVersions)
		.leftJoin(users, eq(users.id, supportVersions.decidedBy))
		.where(and(eq(supportVersions.supportId, supportId), current))
		.orderBy(asc(supportVersions.code));
}

async function signedPages(
	images: { page: number; width: number; height: number; keys: Record<string, string> }[] | null
) {
	if (!images?.length) return [];
	const storage = fileStorage();
	return Promise.all(
		images.map(async (p) => ({
			page: p.page,
			width: p.width,
			height: p.height,
			srcset: (
				await Promise.all(
					PAGE_WIDTHS.filter((w) => p.keys[w]).map(
						async (w) => `${await storage.readUrl(p.keys[w]!)} ${w}w`
					)
				)
			).join(', '),
			src: await storage.readUrl(p.keys[PAGE_WIDTHS[0]] ?? Object.values(p.keys)[0]!)
		}))
	);
}

/** Todo lo que necesita el visor: páginas firmadas, revisión anterior, comentarios e historial. */
export async function getVersionView(actor: Actor, supportId: string, versionId: string) {
	const [v] = await db
		.select({
			id: supportVersions.id,
			code: supportVersions.code,
			kitsCount: supportVersions.kitsCount,
			status: supportVersions.status,
			revision: supportVersions.revision,
			fileKey: supportVersions.fileKey,
			fileSize: supportVersions.fileSize,
			fileHash: supportVersions.fileHash,
			originalName: supportVersions.originalName,
			pageImages: supportVersions.pageImages,
			prevVersionId: supportVersions.prevVersionId,
			uploadedAt: supportVersions.uploadedAt,
			uploadedBy: users.name,
			supersededAt: supportVersions.supersededAt
		})
		.from(supportVersions)
		.leftJoin(users, eq(users.id, supportVersions.uploadedBy))
		.where(and(eq(supportVersions.id, versionId), eq(supportVersions.supportId, supportId)));
	if (!v) return null;
	const [prev] = v.prevVersionId
		? await db
				.select({
					id: supportVersions.id,
					revision: supportVersions.revision,
					pageImages: supportVersions.pageImages
				})
				.from(supportVersions)
				.where(eq(supportVersions.id, v.prevVersionId))
		: [];
	const [comments, decisions, pages, prevPages, download] = await Promise.all([
		db
			.select({
				id: versionComments.id,
				at: versionComments.at,
				text: versionComments.text,
				page: versionComments.page,
				x: versionComments.x,
				y: versionComments.y,
				author: sql<string>`coalesce(${users.name}, ${versionComments.authorLabel})`,
				authorLabel: versionComments.authorLabel
			})
			.from(versionComments)
			.leftJoin(users, eq(users.id, versionComments.userId))
			.where(inArray(versionComments.versionId, [v.id, ...(prev ? [prev.id] : [])]))
			.orderBy(asc(versionComments.at)),
		db
			.select()
			.from(versionDecisions)
			.where(eq(versionDecisions.versionId, v.id))
			.orderBy(desc(versionDecisions.at))
			.limit(10),
		signedPages(v.pageImages),
		signedPages(prev?.pageImages ?? null),
		v.fileKey && v.fileHash
			? fileStorage().readUrl(v.fileKey, {
					filename: v.originalName ?? `${v.code}.pdf`,
					contentType: 'application/pdf'
				})
			: null
	]);
	return {
		...v,
		pages,
		prev: prev ? { id: prev.id, revision: prev.revision, pages: prevPages } : null,
		comments,
		decisions,
		downloadUrl: download,
		canDecide: can(actor, 'artwork.decide', {
			brandCode: (await getSupportForActor(actor, supportId))?.brandCode
		}),
		canComment: can(actor, 'artwork.view')
	};
}

/* ---------- Decisiones ---------- */

type Decision = 'approve' | 'changes' | 'reopen' | 'undo';

async function versionWithBrand(versionId: string) {
	const [v] = await db
		.select({
			id: supportVersions.id,
			supportId: supportVersions.supportId,
			code: supportVersions.code,
			status: supportVersions.status,
			revision: supportVersions.revision,
			fileHash: supportVersions.fileHash,
			uploadedBy: supportVersions.uploadedBy,
			decidedBy: supportVersions.decidedBy,
			decidedAt: supportVersions.decidedAt,
			supersededAt: supportVersions.supersededAt,
			supportName: supports.name,
			stage: supports.stage,
			campaignId: campaigns.id,
			brandCode: campaigns.brandCode
		})
		.from(supportVersions)
		.innerJoin(supports, eq(supports.id, supportVersions.supportId))
		.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
		.where(eq(supportVersions.id, versionId));
	return v ?? null;
}

/** A quién avisar de una decisión: quien subió la versión y Operaciones. */
async function opsRecipients(uploadedBy: string | null) {
	const ops = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.role, 'ops'), eq(users.status, 'active')));
	return [...new Set([...(uploadedBy ? [uploadedBy] : []), ...ops.map((u) => u.id)])];
}

async function notify(
	userIds: string[],
	n: { kind: string; title: string; entity: string; entityId: string; href: string },
	exclude?: string
) {
	const ids = userIds.filter((id) => id !== exclude);
	if (!ids.length) return;
	await db.insert(notifications).values(ids.map((userId) => ({ id: randomUUID(), userId, ...n })));
}

/** Al quedar todo aprobado, el soporte pasa a producción; si se reabre, vuelve a aprobación. */
async function syncSupportStage(supportId: string, stage: number) {
	const [{ open } = { open: 0 }] = await db
		.select({
			open: sql<number>`count(*) filter (where ${supportVersions.status} <> 'approved')::int`
		})
		.from(supportVersions)
		.where(and(eq(supportVersions.supportId, supportId), current));
	if (open === 0 && stage <= 2)
		await db.update(supports).set({ stage: 3 }).where(eq(supports.id, supportId));
	if (open > 0 && stage === 3)
		await db.update(supports).set({ stage: 2 }).where(eq(supports.id, supportId));
}

export async function decide(
	actor: Actor & { name?: string },
	versionId: string,
	decision: Decision,
	p: { comment?: string } & Meta = {}
) {
	const v = await versionWithBrand(versionId);
	if (!v || v.supersededAt) throw new ApprovalError('Versión no encontrada');
	if (!can(actor, 'artwork.decide', { brandCode: v.brandCode }))
		throw new ApprovalError('Solo marketing de la marca aprueba sus artes');
	const comment = p.comment?.trim() ?? '';
	let next: 'pending' | 'approved' | 'changes';
	let record: 'approved' | 'changes' | 'reopened' | 'undone';
	if (decision === 'approve') {
		if (v.status === 'approved') throw new ApprovalError('Ya está aprobada');
		[next, record] = ['approved', 'approved'];
	} else if (decision === 'changes') {
		if (comment.length < 3) throw new ApprovalError('Explica qué hay que cambiar');
		if (v.status === 'changes') throw new ApprovalError('Ya tiene cambios pedidos');
		[next, record] = ['changes', 'changes'];
	} else if (decision === 'reopen') {
		if (v.status === 'pending') throw new ApprovalError('Ya está pendiente');
		[next, record] = ['pending', 'reopened'];
	} else {
		const recent =
			v.decidedBy === actor.id &&
			v.decidedAt &&
			Date.now() - v.decidedAt.getTime() < UNDO_SECONDS * 1000;
		if (v.status !== 'approved' || !recent) throw new ApprovalError('Ya no se puede deshacer');
		[next, record] = ['pending', 'undone'];
	}
	const userName = actor.name ?? null;
	await db.transaction(async (tx) => {
		await tx
			.update(supportVersions)
			.set({
				status: next,
				decidedBy: next === 'approved' ? actor.id : next === 'changes' ? actor.id : null,
				decidedAt: next === 'pending' ? null : new Date()
			})
			.where(eq(supportVersions.id, versionId));
		await tx.insert(versionDecisions).values({
			versionId,
			decision: record,
			userId: actor.id,
			userName,
			comment: comment || null,
			fileHash: v.fileHash,
			revision: v.revision,
			userAgent: p.userAgent?.slice(0, 300) ?? null
		});
		if (decision === 'changes')
			await tx
				.insert(versionComments)
				.values({ id: randomUUID(), versionId, userId: actor.id, text: comment });
	});
	await syncSupportStage(v.supportId, v.stage);
	if (next === 'approved') await generateQrOnApproval(v.supportId, actor.id);
	const verb = {
		approved: 'ha aprobado',
		changes: 'pide cambios en',
		reopened: 'ha reabierto',
		undone: 'ha deshecho la aprobación de'
	}[record];
	await notify(
		await opsRecipients(v.uploadedBy),
		{
			kind: `artwork.${record}`,
			title: `${userName ?? 'Marketing'} ${verb} ${v.code} · ${v.supportName}`,
			entity: 'support_version',
			entityId: versionId,
			href: `/aprobaciones?soporte=${v.supportId}&version=${versionId}`
		},
		actor.id
	);
	await audit({
		userId: actor.id,
		action: `artwork.${record}`,
		entity: 'support_version',
		entityId: versionId,
		before: { status: v.status },
		after: {
			status: next,
			revision: v.revision,
			fileHash: v.fileHash,
			comment: comment || undefined,
			device: deviceLabel(p.userAgent)
		},
		ip: p.ip,
		userAgent: p.userAgent
	});
	return { code: v.code, status: next };
}

/** Aprobar todas las pendientes del soporte (las que tienen cambios pedidos quedan fuera). */
export async function approveAll(
	actor: Actor & { name?: string },
	supportId: string,
	meta: Meta = {}
) {
	const s = await getSupportForActor(actor, supportId);
	if (!s || !can(actor, 'artwork.decide', { brandCode: s.brandCode }))
		throw new ApprovalError('Solo marketing de la marca aprueba sus artes');
	const pending = await db
		.select({
			id: supportVersions.id,
			code: supportVersions.code,
			revision: supportVersions.revision,
			fileHash: supportVersions.fileHash,
			uploadedBy: supportVersions.uploadedBy
		})
		.from(supportVersions)
		.where(
			and(eq(supportVersions.supportId, supportId), current, eq(supportVersions.status, 'pending'))
		);
	if (!pending.length) throw new ApprovalError('No hay versiones pendientes');
	await db.transaction(async (tx) => {
		await tx
			.update(supportVersions)
			.set({ status: 'approved', decidedBy: actor.id, decidedAt: new Date() })
			.where(
				inArray(
					supportVersions.id,
					pending.map((p) => p.id)
				)
			);
		await tx.insert(versionDecisions).values(
			pending.map((p) => ({
				versionId: p.id,
				decision: 'approved' as const,
				userId: actor.id,
				userName: actor.name ?? null,
				fileHash: p.fileHash,
				revision: p.revision,
				userAgent: meta.userAgent?.slice(0, 300) ?? null
			}))
		);
	});
	await syncSupportStage(supportId, s.stage);
	await generateQrOnApproval(supportId, actor.id);
	const uploaders = [...new Set(pending.map((p) => p.uploadedBy).filter((x): x is string => !!x))];
	await notify(
		[...new Set([...uploaders, ...(await opsRecipients(null))])],
		{
			kind: 'artwork.approved',
			title: `${actor.name ?? 'Marketing'} ha aprobado ${pending.length} versiones · ${s.name}`,
			entity: 'support',
			entityId: supportId,
			href: `/aprobaciones?soporte=${supportId}`
		},
		actor.id
	);
	await audit({
		userId: actor.id,
		action: 'artwork.approved_all',
		entity: 'support',
		entityId: supportId,
		after: { versions: pending.map((p) => p.code), device: deviceLabel(meta.userAgent) },
		...meta
	});
	return pending.length;
}

export async function addComment(
	actor: Actor & { name?: string },
	versionId: string,
	p: { text: string; page?: number | null; x?: number | null; y?: number | null } & Meta
) {
	const v = await versionWithBrand(versionId);
	if (!v || !can(actor, 'artwork.view', { brandCode: v.brandCode }))
		throw new ApprovalError('Versión no encontrada');
	const text = p.text.trim();
	if (text.length < 2) throw new ApprovalError('Escribe el comentario');
	const anchored =
		p.page !== null &&
		p.page !== undefined &&
		p.x !== null &&
		p.x !== undefined &&
		p.y !== null &&
		p.y !== undefined;
	await db.insert(versionComments).values({
		id: randomUUID(),
		versionId,
		userId: actor.id,
		text: text.slice(0, 2000),
		page: anchored ? p.page : null,
		x: anchored ? Math.min(1, Math.max(0, p.x!)) : null,
		y: anchored ? Math.min(1, Math.max(0, p.y!)) : null
	});
	// Si comenta marketing, se avisa a quien subió; si comenta Promopicking, a la marca.
	const recipients =
		actor.role === 'brand'
			? await opsRecipients(v.uploadedBy)
			: (
					await db
						.select({ id: userBrands.userId })
						.from(userBrands)
						.where(eq(userBrands.brandCode, v.brandCode))
				).map((r) => r.id);
	await notify(
		recipients,
		{
			kind: 'artwork.comment',
			title: `${actor.name ?? 'Alguien'} comenta ${v.code} · ${v.supportName}`,
			entity: 'support_version',
			entityId: versionId,
			href: `/aprobaciones?soporte=${v.supportId}&version=${versionId}`
		},
		actor.id
	);
	await audit({
		userId: actor.id,
		action: 'artwork.commented',
		entity: 'support_version',
		entityId: versionId,
		...p
	});
}

/** Datos del acta de aprobación de un soporte. */
export async function certificateData(actor: Actor, supportId: string) {
	const s = await getSupportForActor(actor, supportId);
	if (!s) return null;
	const versions = await listVersions(supportId);
	const lastApproval = await db
		.select({
			versionId: versionDecisions.versionId,
			userAgent: versionDecisions.userAgent,
			fileHash: versionDecisions.fileHash,
			at: versionDecisions.at
		})
		.from(versionDecisions)
		.where(
			and(
				inArray(versionDecisions.versionId, versions.map((v) => v.id).concat([''])),
				eq(versionDecisions.decision, 'approved')
			)
		)
		.orderBy(desc(versionDecisions.at));
	const [hashes] = [
		await db
			.select({ id: supportVersions.id, fileHash: supportVersions.fileHash })
			.from(supportVersions)
			.where(inArray(supportVersions.id, versions.map((v) => v.id).concat([''])))
	];
	return {
		support: s,
		versions: versions.map((v) => {
			const d = lastApproval.find((x) => x.versionId === v.id);
			return {
				...v,
				device: d?.userAgent ? deviceLabel(d.userAgent) : null,
				hash: d?.fileHash ?? hashes.find((h) => h.id === v.id)?.fileHash ?? null
			};
		})
	};
}

/* ---------- Subida de artes finales ---------- */

const uploadKey = (uploadId: string, itemId: string) => `subidas/${uploadId}/${itemId}.pdf`;

/** Paso 1: el servidor reserva claves y devuelve URL de subida directa (los PDF no pasan por la función). */
export async function prepareUpload(
	actor: Actor,
	supportId: string,
	files: { name: string; size: number }[],
	meta: Meta = {}
) {
	if (!can(actor, 'artwork.upload')) throw new ApprovalError('No puedes subir artes finales');
	const s = await getSupportForActor(actor, supportId);
	if (!s) throw new ApprovalError('Soporte no encontrado');
	if (!files.length || files.length > 60) throw new ApprovalError('Sube entre 1 y 60 ficheros');
	for (const f of files) {
		if (!/\.pdf$/i.test(f.name)) throw new ApprovalError(`${f.name}: solo PDF`);
		if (f.size <= 0 || f.size > MAX_PDF_BYTES) throw new ApprovalError(`${f.name}: máximo 50 MB`);
	}
	const uploadId = randomUUID();
	await db.insert(artworkUploads).values({ id: uploadId, supportId, uploadedBy: actor.id });
	const storage = fileStorage();
	const items = await Promise.all(
		files.map(async (f) => {
			const id = randomUUID();
			const fileKey = uploadKey(uploadId, id);
			await db
				.insert(artworkUploadItems)
				.values({ id, uploadId, originalName: f.name.slice(0, 200), fileKey, size: f.size });
			return {
				id,
				name: f.name,
				url: await storage.uploadUrl(fileKey, { contentType: 'application/pdf', size: f.size })
			};
		})
	);
	await audit({
		userId: actor.id,
		action: 'artwork.upload_started',
		entity: 'artwork_upload',
		entityId: uploadId,
		after: { supportId, files: files.length },
		...meta
	});
	return { uploadId, items };
}

/** Subida sin JavaScript: el formulario trae los ficheros y el servidor los guarda. */
export async function uploadDirect(
	actor: Actor,
	supportId: string,
	files: File[],
	meta: Meta = {}
) {
	const { uploadId, items } = await prepareUpload(
		actor,
		supportId,
		files.map((f) => ({ name: f.name, size: f.size })),
		meta
	);
	const storage = fileStorage();
	for (const [i, item] of items.entries())
		await storage.put(
			uploadKey(uploadId, item.id),
			new Uint8Array(await files[i]!.arrayBuffer()),
			'application/pdf'
		);
	return registerUpload(actor, uploadId);
}

async function getUpload(actor: Actor, uploadId: string) {
	const [u] = await db.select().from(artworkUploads).where(eq(artworkUploads.id, uploadId));
	if (!u || u.publishedAt || u.discardedAt) throw new ApprovalError('La subida ya no está abierta');
	if (u.uploadedBy !== actor.id && actor.role !== 'admin')
		throw new ApprovalError('No es tu subida');
	return u;
}

/** Paso 2: comprueba cada fichero (existe, tamaño, firma de PDF), calcula su huella y detecta el código. */
export async function registerUpload(actor: Actor, uploadId: string) {
	const u = await getUpload(actor, uploadId);
	const existing = (await listVersions(u.supportId)).map((v) => v.code);
	const items = await db
		.select()
		.from(artworkUploadItems)
		.where(eq(artworkUploadItems.uploadId, uploadId));
	const storage = fileStorage();
	for (const item of items) {
		if (item.registeredAt) continue;
		const body = await storage.get(item.fileKey);
		let error: string | null = null;
		if (!body) error = 'No ha llegado el fichero';
		else if (body.byteLength > MAX_PDF_BYTES) error = 'Pasa de 50 MB';
		else if (!isPdf(body)) error = 'No es un PDF';
		const parsed = parseArtworkFilename(item.originalName, existing);
		await db
			.update(artworkUploadItems)
			.set({
				registeredAt: new Date(),
				error,
				size: body?.byteLength ?? item.size,
				sha256: body && !error ? sha256(body) : null,
				detectedCode: parsed.code
			})
			.where(eq(artworkUploadItems.id, item.id));
	}
	return uploadId;
}

export async function getUploadReview(actor: Actor, uploadId: string) {
	const [u] = await db.select().from(artworkUploads).where(eq(artworkUploads.id, uploadId));
	if (!u) return null;
	const s = await getSupportForActor(actor, u.supportId);
	if (!s || !can(actor, 'artwork.upload')) return null;
	const [items, versions] = await Promise.all([
		db
			.select()
			.from(artworkUploadItems)
			.where(eq(artworkUploadItems.uploadId, uploadId))
			.orderBy(asc(artworkUploadItems.originalName)),
		listVersions(u.supportId)
	]);
	const byKey = new Map(versions.map((v) => [codeKey(v.code), v]));
	return {
		upload: u,
		support: s,
		codes: versions.map((v) => v.code),
		items: items.map((i) => {
			const v = i.detectedCode ? byKey.get(codeKey(i.detectedCode)) : undefined;
			return {
				...i,
				match: v ? { id: v.id, code: v.code, revision: v.revision, status: v.status } : null
			};
		})
	};
}

/**
 * Paso 3: publicar. Para cada fichero válido convierte las páginas, crea la versión (o una
 * revisión nueva del mismo código, que sustituye a la anterior) y avisa a la marca.
 */
export async function publishUpload(
	actor: Actor & { name?: string },
	uploadId: string,
	codes: Record<string, string>,
	meta: Meta = {}
) {
	const u = await getUpload(actor, uploadId);
	const s = await getSupportForActor(actor, u.supportId);
	if (!s) throw new ApprovalError('Soporte no encontrado');
	const items = (
		await db.select().from(artworkUploadItems).where(eq(artworkUploadItems.uploadId, uploadId))
	).filter((i) => !i.error && i.sha256);
	if (!items.length) throw new ApprovalError('No hay ficheros válidos que publicar');
	const finalCodes = items.map((i) =>
		(codes[i.id] ?? i.detectedCode ?? '').trim().replace(/\s+/g, ' ')
	);
	if (finalCodes.some((c) => c.length < 2))
		throw new ApprovalError('Falta el código de alguna versión');
	if (new Set(finalCodes.map(codeKey)).size !== finalCodes.length)
		throw new ApprovalError('Hay dos ficheros con el mismo código');

	const versions = await listVersions(u.supportId);
	const byKey = new Map(versions.map((v) => [codeKey(v.code), v]));
	const storage = fileStorage();
	const created: { id: string; code: string; revision: number }[] = [];
	for (const [n, item] of items.entries()) {
		const code = finalCodes[n]!;
		const previous = byKey.get(codeKey(code));
		const [prevRow] = previous
			? await db
					.select({ fileHash: supportVersions.fileHash, kitsCount: supportVersions.kitsCount })
					.from(supportVersions)
					.where(eq(supportVersions.id, previous.id))
			: [];
		if (prevRow?.fileHash === item.sha256)
			throw new ApprovalError(`${item.originalName}: es el mismo fichero que la revisión vigente`);
		const body = await storage.get(item.fileKey);
		if (!body) throw new ApprovalError(`${item.originalName}: no se encuentra`);
		const id = randomUUID();
		const { pages } = await renderPages(body);
		const pageImages: PageImage[] = [];
		for (const p of pages) {
			const keys: Record<string, string> = {};
			for (const w of PAGE_WIDTHS) {
				keys[w] = `artes/${s.campaignId}/${s.id}/${id}/p${p.page}-${w}.webp`;
				await storage.put(keys[w], p.images[w]!, 'image/webp');
			}
			pageImages.push({ page: p.page, width: p.width, height: p.height, keys });
		}
		const parsed = parseVersionCode(code);
		await db.transaction(async (tx) => {
			if (previous)
				await tx
					.update(supportVersions)
					.set({ supersededAt: new Date() })
					.where(eq(supportVersions.id, previous.id));
			await tx.insert(supportVersions).values({
				id,
				supportId: s.id,
				code: parsed.code,
				tariff: parsed.tariff,
				assortment: parsed.assortment,
				language: parsed.language,
				variant: parsed.variant,
				kitsCount: prevRow?.kitsCount ?? null,
				status: 'pending',
				revision: previous ? previous.revision + 1 : 1,
				fileKey: item.fileKey,
				fileSize: item.size,
				fileHash: item.sha256,
				originalName: item.originalName,
				pageImages,
				uploadedBy: actor.id,
				uploadedAt: new Date(),
				prevVersionId: previous?.id ?? null
			});
		});
		created.push({ id, code: parsed.code, revision: previous ? previous.revision + 1 : 1 });
	}
	await db
		.update(artworkUploads)
		.set({ publishedAt: new Date() })
		.where(eq(artworkUploads.id, uploadId));
	if (s.stage < 2) await db.update(supports).set({ stage: 2 }).where(eq(supports.id, s.id));
	else if (s.stage === 3) await db.update(supports).set({ stage: 2 }).where(eq(supports.id, s.id));
	const brandUsers = await db
		.select({ id: users.id })
		.from(users)
		.innerJoin(userBrands, eq(userBrands.userId, users.id))
		.where(
			and(
				eq(userBrands.brandCode, s.brandCode),
				eq(users.status, 'active'),
				ne(users.role, 'manager')
			)
		);
	await notify(
		brandUsers.map((b) => b.id),
		{
			kind: 'artwork.pending',
			title: `${created.length === 1 ? '1 versión nueva' : `${created.length} versiones nuevas`} para aprobar · ${s.name}`,
			entity: 'support',
			entityId: s.id,
			href: `/aprobaciones?soporte=${s.id}`
		}
	);
	await audit({
		userId: actor.id,
		action: 'artwork.published',
		entity: 'artwork_upload',
		entityId: uploadId,
		after: { supportId: s.id, versions: created.map((c) => `${c.code} r${c.revision}`) },
		...meta
	});
	return created;
}

export async function discardUpload(actor: Actor, uploadId: string) {
	await getUpload(actor, uploadId);
	const items = await db
		.select()
		.from(artworkUploadItems)
		.where(eq(artworkUploadItems.uploadId, uploadId));
	const storage = fileStorage();
	for (const i of items) await storage.delete(i.fileKey).catch(() => {});
	await db
		.update(artworkUploads)
		.set({ discardedAt: new Date() })
		.where(eq(artworkUploads.id, uploadId));
}
