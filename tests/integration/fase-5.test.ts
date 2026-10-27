/** Integración de la fase 5: QR de versión (generación y landing) y pedidos de reposición. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import {
	advanceOrder,
	cancelOrder,
	getOrder,
	listOrders,
	OrderError,
	placeOrder,
	validateOrder
} from '$lib/server/services/orders';
import {
	generateQr,
	QrError,
	qrLanding,
	qrReorder,
	qrReport,
	qrRetire
} from '$lib/server/services/qr';

const T = tables;
let jorge: SessionUser, ana: SessionUser, marta: SessionUser;
const created: string[] = [];
const tickets: string[] = [];
let code = '';

beforeAll(async () => {
	const l = await Promise.all(['u-jorge-martin', 'u-ana-soler', 'u-marta-ruiz'].map(loadActor));
	[jorge, ana, marta] = l.map((u) => u!) as [SessionUser, SessionUser, SessionUser];
	const [q] = await db
		.select({ code: T.qrCodes.code })
		.from(T.qrCodes)
		.where(and(eq(T.qrCodes.supportId, 'fh-tg'), eq(T.qrCodes.restaurantId, 'FH-0147')));
	code = q!.code;
});

afterAll(async () => {
	if (created.length) await db.delete(T.orders).where(inArray(T.orders.id, created));
	if (tickets.length) await db.delete(T.tickets).where(inArray(T.tickets.id, tickets));
	await db.update(T.qrCodes).set({ retiredAt: null }).where(eq(T.qrCodes.code, code));
	await closeDb();
});

describe('QR de versión', () => {
	it('el seed deja un código por versión aprobada y restaurante, y generar no duplica', async () => {
		await expect(generateQr(marta, 'fh-tg')).rejects.toBeInstanceOf(QrError);
		expect(await generateQr(jorge, 'fh-tg')).toBe(0);
	});

	it('la landing muestra la pieza sin datos sensibles', async () => {
		const q = await qrLanding(code);
		expect(q).toMatchObject({
			state: 'vigente',
			support: 'Tarifario genérico 35×30',
			versionCode: 'C2 ALL SP',
			restaurant: 'FH Plenilunio'
		});
		expect(Object.keys(q!)).not.toContain('price');
		expect(await qrLanding('ZZZZ-ZZZZ')).toBeNull();
		expect(await qrLanding('nada')).toBeNull();
	});

	it('un pedido desde QR nace pendiente y llega validado a reparto', async () => {
		await expect(qrReorder(code, 0)).rejects.toThrow('entre 1 y 50');
		const id = await qrReorder(code, 3);
		created.push(id);
		let o = await getOrder(jorge, id);
		expect(o).toMatchObject({
			state: 'pending_validation',
			source: 'qr',
			qrCode: code,
			restaurantId: 'FH-0147',
			total: 0
		});
		expect(o!.lines).toEqual([
			expect.objectContaining({
				label: 'Tarifario genérico 35×30',
				versionCode: 'C2 ALL SP',
				qty: 3
			})
		]);
		expect((await listOrders(jorge, { state: 'pending_validation' })).map((x) => x.id)).toContain(
			id
		);
		// Solo Promopicking valida, y no se avanza sin validar.
		await expect(validateOrder(ana, id, true, null)).rejects.toBeInstanceOf(OrderError);
		await expect(advanceOrder(jorge, id)).rejects.toThrow('no puede avanzar');
		await validateOrder(jorge, id, true, null);
		expect(await advanceOrder(jorge, id)).toBe('shipping');
		o = await getOrder(ana, id);
		expect(o).toMatchObject({ state: 'shipping' });
		expect(o!.validatedAt).toBeInstanceOf(Date);
		expect(o!.shippedAt).toBeInstanceOf(Date);
		// El gerente lo ve en su campana.
		const [n] = await db
			.select()
			.from(T.notifications)
			.where(
				and(
					eq(T.notifications.userId, ana.id),
					eq(T.notifications.entityId, id),
					like(T.notifications.title, '%reparto%')
				)
			);
		expect(n).toBeTruthy();
	});

	it('rechazar exige motivo y lo deja en el pedido', async () => {
		const id = await qrReorder(code, 1);
		created.push(id);
		await expect(validateOrder(jorge, id, false, '')).rejects.toThrow('por qué');
		await validateOrder(jorge, id, false, 'Ya va en el kit de la campaña');
		expect(await getOrder(jorge, id)).toMatchObject({
			state: 'cancelled',
			reason: 'Ya va en el kit de la campaña'
		});
	});

	it('avisar de un error abre una consulta con el lote y el motivo', async () => {
		const id = await qrReport(code, 'Pieza dañada', 'Llegó rota la esquina');
		tickets.push(id);
		expect(id).toMatch(/^CON-\d+$/);
		const [t] = await db.select().from(T.tickets).where(eq(T.tickets.id, id));
		expect(t).toMatchObject({
			type: 'query',
			kind: 'Pieza dañada',
			restaurantId: 'FH-0147',
			openedByLabel: `QR ${code}`
		});
		expect(t!.title).toContain('C2 ALL SP');
	});

	it('marcar retirada cambia el estado de la landing', async () => {
		await qrRetire(code);
		expect((await qrLanding(code))!.state).toBe('retirada');
		await qrRetire(code); // dos veces no falla
	});
});

describe('pedidos desde el portal', () => {
	it('precios del catálogo, ámbito del gerente y cancelación antes del reparto', async () => {
		await expect(placeOrder(ana, 'FH-0061', [{ itemId: 'g1', qty: 1 }], null)).rejects.toThrow(
			'No puedes'
		);
		await expect(placeOrder(ana, 'FH-0147', [{ itemId: 'g8', qty: 1 }], null)).rejects.toThrow(
			'no disponible'
		);
		await expect(placeOrder(ana, 'FH-0147', [{ itemId: 'g1', qty: 0 }], null)).rejects.toThrow(
			'al menos'
		);
		const r = await placeOrder(
			ana,
			'FH-0147',
			[
				{ itemId: 'g1', qty: 2 },
				{ itemId: 'l3', qty: 1 }
			],
			'Recepción de 9 a 12',
			{}
		);
		created.push(r.id);
		expect(r).toMatchObject({ total: 2 * 4850 + 3800, leadDays: 5 });
		const o = await getOrder(ana, r.id);
		expect(o).toMatchObject({
			state: 'preparing',
			source: 'web',
			note: 'Recepción de 9 a 12',
			placedById: ana.id
		});
		// La marca FH también lo ve.
		expect(await getOrder(marta, r.id)).not.toBeNull();
		await cancelOrder(ana, r.id);
		expect(await getOrder(ana, r.id)).toMatchObject({ state: 'cancelled' });
		await expect(cancelOrder(ana, r.id)).rejects.toThrow('antes de salir');
	});

	it('solo Promopicking avanza el estado', async () => {
		const r = await placeOrder(jorge, 'FH-0147', [{ itemId: 'g3', qty: 1 }], null);
		created.push(r.id);
		await expect(advanceOrder(ana, r.id)).rejects.toBeInstanceOf(OrderError);
		expect(await advanceOrder(jorge, r.id)).toBe('shipping');
		expect(await advanceOrder(jorge, r.id)).toBe('delivered');
		await expect(cancelOrder(jorge, r.id)).rejects.toThrow('antes de salir');
	});
});
