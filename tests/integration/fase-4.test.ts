/** Integración de la fase 4: generación, escaneos idempotentes, recepción e incidencia. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import {
	generateKits,
	getKit,
	KitError,
	openIncident,
	receiveKit,
	registerScan,
	storePhoto
} from '$lib/server/services/kits';

const T = tables;
let jorge: SessionUser, ana: SessionUser, marta: SessionUser;
const CAMPAIGN = 'FH-26-09';
const KIT = 'K-FH2609-0147';

beforeAll(async () => {
	const l = await Promise.all(['u-jorge-martin', 'u-ana-soler', 'u-marta-ruiz'].map(loadActor));
	[jorge, ana, marta] = l.map((u) => u!) as [SessionUser, SessionUser, SessionUser];
	await db.delete(T.kits).where(eq(T.kits.campaignId, CAMPAIGN));
});

afterAll(async () => {
	await db.delete(T.kits).where(eq(T.kits.campaignId, CAMPAIGN));
	await closeDb();
});

describe('kits', () => {
	it('genera un kit por restaurante activo con la versión de cada soporte', async () => {
		await expect(generateKits(marta, CAMPAIGN)).rejects.toBeInstanceOf(KitError);
		const n = await generateKits(jorge, CAMPAIGN);
		expect(n).toBe(10);
		expect(await generateKits(jorge, CAMPAIGN)).toBe(0);
		const kit = await getKit(jorge, KIT);
		expect(kit).toMatchObject({ state: 0, restaurantName: 'FH Plenilunio' });
		expect(kit!.lines.map((l) => l.label)).toEqual([
			'Encarte menú Navidad 160×260',
			'Díptico 120×120'
		]);
		expect(kit!.events.map((e) => e.type)).toEqual(['prepared']);
		// Como si el kit se hubiera preparado ayer.
		await db
			.update(T.kitEvents)
			.set({ at: new Date(Date.now() - 86_400_000) })
			.where(eq(T.kitEvents.kitId, KIT));
	});

	it('los escaneos siguen el orden, conservan la hora del dispositivo y no se duplican', async () => {
		await expect(registerScan(jorge, { kitId: KIT, step: 'hub_in' })).rejects.toThrow('Expedición');
		const at = new Date(Date.now() - 3600_000);
		const clientId = randomUUID();
		const r = await registerScan(jorge, {
			kitId: KIT.toLowerCase(),
			step: 'shipped',
			at,
			clientId
		});
		expect(r).toMatchObject({ state: 1, already: false, restaurant: 'FH Plenilunio' });
		// Reenvío de la cola: mismo id de cliente → ya consta, sin evento nuevo.
		expect((await registerScan(jorge, { kitId: KIT, step: 'shipped', at, clientId })).already).toBe(
			true
		);
		// Otro dispositivo escanea el mismo paso: tampoco duplica.
		expect(
			(await registerScan(jorge, { kitId: KIT, step: 'shipped', clientId: randomUUID() })).already
		).toBe(true);
		const events = await db.select().from(T.kitEvents).where(eq(T.kitEvents.kitId, KIT));
		const shipped = events.filter((e) => e.type === 'shipped');
		expect(shipped).toHaveLength(1);
		expect(Math.abs(shipped[0]!.at.getTime() - at.getTime())).toBeLessThan(1000);
		expect(shipped[0]!.recordedAt.getTime()).toBeGreaterThan(shipped[0]!.at.getTime());
		// Un reloj atrasado no pone un evento antes del anterior.
		const before = await registerScan(jorge, {
			kitId: KIT,
			step: 'hub_in',
			at: new Date(Date.now() - 2 * 86_400_000)
		});
		expect(before.state).toBe(2);
		const hub = (await db.select().from(T.kitEvents).where(eq(T.kitEvents.kitId, KIT))).find(
			(e) => e.type === 'hub_in'
		)!;
		expect(hub.at.getTime()).toBeGreaterThanOrEqual(shipped[0]!.at.getTime());
	});

	it('el gerente no escanea; recibe solo su restaurante y con todos los bultos', async () => {
		await expect(registerScan(ana, { kitId: KIT, step: 'hub_in' })).rejects.toThrow(
			'No puedes escanear'
		);
		await registerScan(jorge, { kitId: KIT, step: 'out_for_delivery' });
		await expect(receiveKit(ana, KIT, { parcelsChecked: [] })).rejects.toThrow('Faltan bultos');
		await expect(receiveKit(ana, 'K-FH2609-0012', { parcelsChecked: [1] })).rejects.toThrow(
			'No existe'
		);
		await receiveKit(ana, KIT, { parcelsChecked: [1], clientId: randomUUID() });
		const kit = await getKit(ana, KIT);
		expect(kit).toMatchObject({ state: 4, receivedBy: 'Ana Soler' });
		expect(kit!.events.map((e) => e.type)).toEqual([
			'prepared',
			'shipped',
			'hub_in',
			'out_for_delivery',
			'received'
		]);
	});

	it('la incidencia exige foto, abre un ticket y avisa a Promopicking', async () => {
		await expect(
			openIncident(ana, KIT, { kind: 'Bulto dañado', text: 'Caja aplastada', photoKey: null })
		).rejects.toThrow('foto');
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(1)]);
		await expect(storePhoto(KIT, new TextEncoder().encode('no es una foto'))).rejects.toThrow(
			'JPEG'
		);
		const photoKey = await storePhoto(KIT, jpeg);
		const r = await openIncident(ana, KIT, {
			kind: 'Bulto dañado',
			text: 'Caja aplastada en una esquina',
			photoKey
		});
		expect(r.ticketId).toMatch(/^INC-\d+$/);
		const [t] = await db.select().from(T.tickets).where(eq(T.tickets.id, r.ticketId!));
		expect(t).toMatchObject({
			type: 'incident',
			severity: 'high',
			restaurantId: 'FH-0147',
			state: 'open'
		});
		const [n] = await db
			.select()
			.from(T.notifications)
			.where(eq(T.notifications.userId, jorge.id))
			.orderBy(desc(T.notifications.createdAt))
			.limit(1);
		expect(n!.title).toContain(r.ticketId!);
		await db.delete(T.tickets).where(eq(T.tickets.id, r.ticketId!));
	});
});
