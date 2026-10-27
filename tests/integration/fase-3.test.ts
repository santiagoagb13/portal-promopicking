/** Integración de la fase 3: decisiones, avisos, subida con conversión real y acta. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import { approvalCertificate, isPdf, samplePdf, sha256 } from '$lib/server/pdf';
import {
	addComment,
	ApprovalError,
	approveAll,
	certificateData,
	decide,
	getUploadReview,
	listApprovalSupports,
	listVersions,
	prepareUpload,
	publishUpload,
	registerUpload
} from '$lib/server/services/approvals';
import { fileStorage } from '$lib/server/storage';
import { sign, verify } from '$lib/server/storage/signing';

let jorge: SessionUser, marta: SessionUser, carlos: SessionUser, ana: SessionUser;
const T = tables;
const touched: string[] = [];

beforeAll(async () => {
	const l = await Promise.all(
		['u-jorge-martin', 'u-marta-ruiz', 'u-carlos-vega', 'u-ana-soler'].map(loadActor)
	);
	[jorge, marta, carlos, ana] = l.map((u) => u!) as [
		SessionUser,
		SessionUser,
		SessionUser,
		SessionUser
	];
});

afterAll(async () => {
	// Las versiones de las pruebas vuelven a pendiente; las creadas por subida se borran.
	if (touched.length)
		await db
			.update(T.supportVersions)
			.set({ status: 'pending', decidedBy: null, decidedAt: null })
			.where(inArray(T.supportVersions.id, touched));
	await closeDb();
});

const lastNotification = async (userId: string) =>
	(
		await db
			.select()
			.from(T.notifications)
			.where(eq(T.notifications.userId, userId))
			.orderBy(desc(T.notifications.createdAt))
			.limit(1)
	)[0];

describe('decisiones', () => {
	it('Marta aprueba y Jorge (quien subió) recibe el aviso, con registro de la revisión y el dispositivo', async () => {
		const id = 'sv-FH-CS-07'; // C2 ALL CAT, pendiente
		touched.push(id);
		await decide(marta, id, 'approve', {
			userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1'
		});
		const [v] = await db.select().from(T.supportVersions).where(eq(T.supportVersions.id, id));
		expect(v).toMatchObject({ status: 'approved', decidedBy: marta.id });
		const [d] = await db
			.select()
			.from(T.versionDecisions)
			.where(eq(T.versionDecisions.versionId, id))
			.orderBy(desc(T.versionDecisions.at))
			.limit(1);
		expect(d).toMatchObject({ decision: 'approved', revision: 1, fileHash: v!.fileHash });
		expect(d!.userAgent).toContain('iPad');
		const n = await lastNotification(jorge.id);
		expect(n!.title).toBe(
			'Marta Ruiz ha aprobado C2 ALL CAT · Carta surtido FH (tríptico 222×320)'
		);
		expect(n!.href).toContain(id);
		// Deshacer dentro de la ventana.
		await decide(marta, id, 'undo');
		expect(
			(await db.select().from(T.supportVersions).where(eq(T.supportVersions.id, id)))[0]!.status
		).toBe('pending');
		await expect(decide(marta, id, 'undo')).rejects.toThrow('deshacer');
	});

	it('pedir cambios exige comentario y lo guarda; reabrir vuelve a pendiente', async () => {
		const id = 'sv-FH-CS-08';
		touched.push(id);
		await expect(decide(marta, id, 'changes', { comment: '' })).rejects.toThrow('Explica');
		await decide(marta, id, 'changes', { comment: 'El precio del menú no es el de la tarifa C2' });
		const comments = await db
			.select()
			.from(T.versionComments)
			.where(eq(T.versionComments.versionId, id));
		expect(comments.at(-1)!.text).toContain('tarifa C2');
		await decide(marta, id, 'reopen');
		expect(
			(await db.select().from(T.supportVersions).where(eq(T.supportVersions.id, id)))[0]!.status
		).toBe('pending');
	});

	it('solo marketing de la marca decide: ni otra marca ni Promopicking', async () => {
		await expect(decide(carlos, 'sv-FH-CS-07', 'approve')).rejects.toBeInstanceOf(ApprovalError);
		await expect(decide(jorge, 'sv-FH-CS-07', 'approve')).rejects.toBeInstanceOf(ApprovalError);
		expect((await listApprovalSupports(carlos)).every((s) => s.brandCode === 'VIPS')).toBe(true);
		expect(await listApprovalSupports(ana)).toEqual([]);
	});

	it('aprobar todas deja fuera las de cambios pedidos y pasa el soporte a producción', async () => {
		const before = await listVersions('fh-cp');
		touched.push(...before.filter((v) => v.status === 'pending').map((v) => v.id));
		const n = await approveAll(marta, 'fh-cp');
		expect(n).toBe(before.filter((v) => v.status === 'pending').length);
		const [s] = await db.select().from(T.supports).where(eq(T.supports.id, 'fh-cp'));
		expect(s!.stage).toBe(3);
		await expect(approveAll(marta, 'fh-cp')).rejects.toThrow('No hay versiones pendientes');
		await db.update(T.supports).set({ stage: 2 }).where(eq(T.supports.id, 'fh-cp'));
	});

	it('comentario anclado a un punto de la página; Jorge se entera', async () => {
		await addComment(marta, 'sv-FH-CS-09', { text: 'Este precio', page: 1, x: 0.25, y: 0.4 });
		const c = (
			await db
				.select()
				.from(T.versionComments)
				.where(eq(T.versionComments.versionId, 'sv-FH-CS-09'))
		).at(-1)!;
		expect([c.page, c.x, c.y]).toEqual([1, 0.25, 0.4]);
		expect((await lastNotification(jorge.id))!.kind).toBe('artwork.comment');
		await db.delete(T.versionComments).where(eq(T.versionComments.id, c.id));
	});
});

describe('subida de artes', () => {
	it('subir → comprobar → publicar: convierte las páginas, crea revisión nueva y avisa a la marca', async () => {
		const pending = (await listVersions('fh-cs')).find((v) => v.code === 'C2 ALL GALL')!;
		const files = [
			{
				name: 'FH-01_C2-ALL-GALL_v2.pdf',
				bytes: await samplePdf({
					title: 'Carta surtido FH',
					code: 'C2 ALL GALL',
					revision: 2,
					pages: ['Exterior', 'Interior'],
					accent: [0.6, 0.2, 0.1]
				})
			},
			{
				name: `FH-01_C9-ALL-SP-${randomUUID().slice(0, 4)}_v1.pdf`,
				bytes: await samplePdf({
					title: 'Carta surtido FH',
					code: 'C9 ALL SP',
					revision: 1,
					pages: ['Exterior', 'Interior'],
					accent: [0.6, 0.2, 0.1]
				})
			},
			{ name: 'no-es-pdf.pdf', bytes: new TextEncoder().encode('hola') }
		];
		await expect(prepareUpload(marta, 'fh-cs', [{ name: 'x.pdf', size: 10 }])).rejects.toThrow(
			'No puedes subir'
		);
		await expect(prepareUpload(jorge, 'fh-cs', [{ name: 'x.png', size: 10 }])).rejects.toThrow(
			'solo PDF'
		);
		const { uploadId, items } = await prepareUpload(
			jorge,
			'fh-cs',
			files.map((f) => ({ name: f.name, size: f.bytes.byteLength }))
		);
		const storage = fileStorage();
		for (const [i, it] of items.entries()) {
			expect(it.url).toMatch(/^\/archivos\/subidas\//);
			const [, query] = it.url.split('?');
			const q = new URLSearchParams(query);
			expect(
				verify(
					[
						'PUT',
						it.url.split('?')[0]!.slice('/archivos/'.length),
						q.get('exp')!,
						q.get('size')!,
						'application/pdf'
					],
					q.get('sig')
				)
			).toBe(true);
			await storage.put(`subidas/${uploadId}/${it.id}.pdf`, files[i]!.bytes, 'application/pdf');
		}
		await registerUpload(jorge, uploadId);
		const review = await getUploadReview(jorge, uploadId);
		const byName = Object.fromEntries(review!.items.map((i) => [i.originalName, i]));
		expect(byName['FH-01_C2-ALL-GALL_v2.pdf']!.match!.code).toBe('C2 ALL GALL');
		expect(byName['no-es-pdf.pdf']!.error).toBe('No es un PDF');
		expect(byName['FH-01_C2-ALL-GALL_v2.pdf']!.sha256).toBe(sha256(files[0]!.bytes));

		const created = await publishUpload(jorge, uploadId, {});
		expect(created.map((c) => `${c.code} r${c.revision}`).sort()).toEqual(
			['C2 ALL GALL r2', expect.stringMatching(/^C9 ALL SP/) as unknown as string].sort()
		);
		const [old] = await db
			.select()
			.from(T.supportVersions)
			.where(eq(T.supportVersions.id, pending.id));
		expect(old!.supersededAt).not.toBeNull();
		const fresh = created.find((c) => c.code === 'C2 ALL GALL')!;
		const [nv] = await db
			.select()
			.from(T.supportVersions)
			.where(eq(T.supportVersions.id, fresh.id));
		expect(nv).toMatchObject({ status: 'pending', revision: 2, prevVersionId: pending.id });
		expect(nv!.pageImages).toHaveLength(2);
		expect(await storage.head(nv!.pageImages![0]!.keys['800']!)).not.toBeNull();
		expect((await lastNotification(marta.id))!.title).toBe(
			'2 versiones nuevas para aprobar · Carta surtido FH (tríptico 222×320)'
		);

		// Limpieza: se borran las versiones creadas y la anterior vuelve a estar vigente.
		await db.delete(T.supportVersions).where(
			inArray(
				T.supportVersions.id,
				created.map((c) => c.id)
			)
		);
		await db
			.update(T.supportVersions)
			.set({ supersededAt: null })
			.where(eq(T.supportVersions.id, pending.id));
		expect((await listVersions('fh-cs')).filter((v) => v.code === 'C2 ALL GALL')).toHaveLength(1);
		void and;
		void isNull;
	});
});

describe('acta y ficheros', () => {
	it('el acta es un PDF con las versiones del soporte', async () => {
		const data = await certificateData(marta, 'fh-tg');
		expect(data!.versions).toHaveLength(9);
		const pdf = await approvalCertificate({
			support: data!.support.name,
			campaign: data!.support.campaignName,
			brand: data!.support.brandShort,
			artworkLabel: data!.support.artworkLabel,
			generatedAt: '22/10/2026 10:00',
			generatedBy: 'Marta Ruiz',
			rows: data!.versions.map((v) => ({
				code: v.code,
				revision: v.revision,
				status: v.status,
				kits: v.kitsCount,
				decidedBy: v.decidedBy,
				decidedAt: null,
				device: v.device,
				hash: v.hash
			}))
		});
		expect(isPdf(pdf)).toBe(true);
		expect(await certificateData(carlos, 'fh-tg')).toBeNull();
	});

	it('las URL del almacenamiento local caducan y no se pueden alterar', () => {
		const sig = sign(['GET', 'artes/a.webp', '9999999999', '']);
		expect(verify(['GET', 'artes/a.webp', '9999999999', ''], sig)).toBe(true);
		expect(verify(['GET', 'artes/b.webp', '9999999999', ''], sig)).toBe(false);
		expect(verify(['GET', 'artes/a.webp', '9999999999', ''], null)).toBe(false);
	});
});
