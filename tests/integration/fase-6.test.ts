/** Integración de la fase 6: ciclo de un registro de soporte e informes que cuadran con los datos. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import { kpiCards } from '$lib/domain/reports';
import { reportPdf } from '$lib/server/report-pdf';
import { liveFrom, ReportError, reportData } from '$lib/server/services/reports';
import {
	assignTicket,
	closeTicket,
	createTicket,
	getTicket,
	listTickets,
	reopenTicket,
	replyTicket,
	setSeverity,
	TicketError
} from '$lib/server/services/tickets';
import { pdfText } from '../support/pdf-text';

const T = tables;
let jorge: SessionUser, ana: SessionUser, marta: SessionUser;
const created: string[] = [];
const TODAY = '2026-10-28';

beforeAll(async () => {
	const l = await Promise.all(['u-jorge-martin', 'u-ana-soler', 'u-marta-ruiz'].map(loadActor));
	[jorge, ana, marta] = l.map((u) => u!) as [SessionUser, SessionUser, SessionUser];
});

afterAll(async () => {
	if (created.length) await db.delete(T.tickets).where(inArray(T.tickets.id, created));
	await closeDb();
});

describe('soporte', () => {
	it('el gerente abre una incidencia de su restaurante; no de otro', async () => {
		await expect(
			createTicket(ana, {
				type: 'incident',
				kind: 'Faltan unidades',
				campaignId: null,
				restaurantId: 'FH-0061',
				text: 'Faltan cartas'
			})
		).rejects.toBeInstanceOf(TicketError);
		const id = await createTicket(ana, {
			type: 'incident',
			kind: 'Faltan unidades',
			campaignId: 'FH-26-09',
			restaurantId: 'FH-0147',
			text: 'Faltan 4 encartes de Navidad\nEl bulto 2 llegó abierto.'
		});
		created.push(id);
		expect(id).toMatch(/^INC-\d+$/);
		const t = await getTicket(ana, id);
		expect(t).toMatchObject({
			state: 'open',
			severity: 'medium',
			title: 'Faltan 4 encartes de Navidad',
			restaurantId: 'FH-0147'
		});
		expect(t!.can).toEqual({ reply: true, manage: false, close: false, reopen: false });
		// Operaciones recibe el aviso en la campana.
		const [n] = await db
			.select()
			.from(T.notifications)
			.where(and(eq(T.notifications.userId, jorge.id), eq(T.notifications.entityId, id)));
		expect(n?.href).toBe(`/soporte?abrir=${id}`);
	});

	it('responder, asignar, severidad, cerrar y reabrir dejan rastro en el hilo', async () => {
		const id = created[0]!;
		await replyTicket(jorge, id, 'Salen hoy con la ruta 14.', null);
		expect((await getTicket(jorge, id))!.state).toBe('answered');
		await replyTicket(ana, id, 'Gracias, aquí estaremos.', null);
		expect((await getTicket(jorge, id))!.state).toBe('in_progress');
		await expect(setSeverity(ana, id, 'high')).rejects.toThrow('Solo Promopicking');
		await setSeverity(jorge, id, 'high');
		await assignTicket(jorge, id, jorge.id);
		await expect(closeTicket(ana, id)).rejects.toThrow('No puedes cerrar');
		await closeTicket(jorge, id);
		let t = await getTicket(ana, id);
		expect(t).toMatchObject({ state: 'closed', severity: 'high', assignedTo: jorge.id });
		expect(t!.closedAt).toBeInstanceOf(Date);
		await expect(replyTicket(ana, id, 'Otra cosa', null)).rejects.toThrow('reábrelo');
		await reopenTicket(ana, id);
		t = await getTicket(jorge, id);
		expect(t).toMatchObject({ state: 'in_progress', closedAt: null });
		expect(t!.updates.map((u) => u.kind)).toEqual([
			'reply',
			'reply',
			'reply',
			'severity',
			'assign',
			'state',
			'state'
		]);
		expect(t!.updates.filter((u) => u.kind !== 'reply').map((u) => u.text)).toEqual([
			'Severidad alta',
			'Responsable: Jorge Martín',
			'Cerrada',
			'Reabierta'
		]);
	});

	it('cada perfil ve su ámbito y los filtros se aplican', async () => {
		const id = created[0]!;
		expect((await listTickets(marta)).map((t) => t.id)).toContain(id); // marca FH
		const vips = (await listTickets(jorge)).find((t) => t.brandCode === 'VIPS');
		expect(vips).toBeTruthy();
		expect((await listTickets(marta)).map((t) => t.id)).not.toContain(vips!.id);
		expect(await getTicket(marta, vips!.id)).toBeNull();
		expect(
			(await listTickets(jorge, { open: true, type: 'query' })).every(
				(t) => t.type === 'query' && t.state !== 'closed'
			)
		).toBe(true);
		expect(
			(await listTickets(jorge, { restaurantId: 'FH-0147', severity: 'high' })).map((t) => t.id)
		).toEqual([id]);
	});
});

describe('informes', () => {
	it('los meses anteriores al portal salen del histórico y los demás de los datos vivos', async () => {
		expect(await liveFrom(TODAY)).toBe('2026-10');
		const r = await reportData(jorge, { period: '12m', today: TODAY });
		expect(r.months).toHaveLength(12);
		const [hist] = await db
			.select({
				parcels: sql<number>`sum(parcels)::int`,
				ok: sql<number>`sum(parcels_ok)::int`,
				pieces: sql<number>`sum(pieces)::int`
			})
			.from(T.reportHistory)
			.where(sql`month < '2026-10'`);
		const sep = r.byMonth.slice(0, 11);
		expect(sep.reduce((n, m) => n + m.parcels, 0)).toBe(hist!.parcels);
		expect(sep.reduce((n, m) => n + m.parcelsOk, 0)).toBe(hist!.ok);
		// Octubre, de los kits: bultos de campañas de octubre ya vencidas o recibidas.
		const [live] = await db
			.execute<{ parcels: number; ok: number }>(
				sql`
			select coalesce(sum(k.parcels) filter (where k.state = 4 or c.in_restaurant_on <= ${TODAY}), 0)::int parcels,
			       coalesce(sum(k.parcels) filter (where k.state = 4 and (k.received_at at time zone 'Europe/Madrid')::date <= c.in_restaurant_on and k.incident_ticket_id is null), 0)::int ok
			from kits k join campaigns c on c.id = k.campaign_id where to_char(c.in_restaurant_on, 'YYYY-MM') = '2026-10'`
			)
			.then((x) => x.rows);
		expect(r.byMonth[11]).toMatchObject({
			month: '2026-10',
			parcels: live!.parcels,
			parcelsOk: live!.ok
		});
		// Las cifras de cabecera son la suma de los meses.
		expect(r.kpis.parcels).toBe(r.byMonth.reduce((n, m) => n + m.parcels, 0));
		expect(r.kpis.incidents).toBe(r.incidentsByKind.reduce((n, k) => n + k.n, 0));
	});

	it('la marca solo ve la suya', async () => {
		await expect(
			reportData(marta, { brand: 'VIPS', period: '12m', today: TODAY })
		).rejects.toBeInstanceOf(ReportError);
		const r = await reportData(marta, { period: 'trimestre', today: TODAY });
		expect(r.brands.map((b) => b.code)).toEqual(['FH']);
		expect(r.byBrand.map((b) => b.code)).toEqual(['FH']);
	});

	it('el PDF lleva las mismas cifras que la página', async () => {
		const r = await reportData(jorge, { brand: 'FH', period: 'trimestre', today: TODAY });
		const text = await pdfText(
			await reportPdf(r, {
				generatedAt: `${TODAY}T10:00`,
				generatedBy: 'Jorge Martín',
				brandName: "Foster's Hollywood"
			})
		);
		for (const k of kpiCards(r.kpis, r.otifTarget, r.period))
			expect(text).toContain(k.value.replace(/\u00a0/g, ' '));
		expect(text).toContain("Foster's Hollywood · Último trimestre");
		expect(text).toContain('agosto de 2026');
		expect(text).toContain('octubre de 2026');
	});
});

describe('limpieza', () => {
	it('no deja avisos de prueba', async () => {
		await db.delete(T.notifications).where(like(T.notifications.title, `${created[0]} ·%`));
	});
});
