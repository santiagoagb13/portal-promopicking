/** Integración de la fase 2 (requiere BD con migraciones y seed). */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import {
	CampaignError,
	createCampaign,
	deleteSupport,
	duplicateCampaign,
	getCampaignDetail,
	listCampaigns,
	saveSupport,
	setArchived,
	updateCampaign
} from '$lib/server/services/campaigns';
import {
	applyImport,
	getRestaurant,
	MasterError,
	previewImport,
	updateRestaurant
} from '$lib/server/services/master';
import { deleteUser, setSuspended, updateAccess, UserAdminError } from '$lib/server/services/users';
import { getSettings, saveSettings } from '$lib/server/services/settings';
import { MILESTONE_OFFSETS } from '$lib/domain/campaign';

const TODAY = '2026-10-22';
const RUN = randomUUID().slice(0, 6);
let jorge: SessionUser, marta: SessionUser, carlos: SessionUser, ana: SessionUser;
const created: string[] = [];
const tempUsers: string[] = [];

beforeAll(async () => {
	const loaded = await Promise.all(
		['u-jorge-martin', 'u-marta-ruiz', 'u-carlos-vega', 'u-ana-soler'].map(loadActor)
	);
	[jorge, marta, carlos, ana] = loaded.map((u) => u!) as [
		SessionUser,
		SessionUser,
		SessionUser,
		SessionUser
	];
});

afterAll(async () => {
	if (created.length)
		await db.delete(tables.campaigns).where(inArray(tables.campaigns.id, created));
	await db.delete(tables.restaurants).where(like(tables.restaurants.name, `Prueba ${RUN}%`));
	if (tempUsers.length) await db.delete(tables.users).where(inArray(tables.users.id, tempUsers));
	await saveSettings(jorge, { milestoneOffsets: MILESTONE_OFFSETS, otifTarget: 97 });
	await closeDb();
});

const input = (over = {}) => ({
	brandCode: 'VIPS',
	name: `Prueba ${RUN} VIPS`,
	inRestaurantOn: '2027-06-15',
	restaurantCount: 170,
	planned: false,
	materials: null,
	notes: null,
	ownerUserId: 'u-carlos-vega',
	...over
});

describe('campañas (criterio de la fase 2)', () => {
	it("un admin crea una campaña de VIPS: la ve VIPS y no la ve Foster's", async () => {
		const id = await createCampaign(jorge, input());
		created.push(id);
		expect(id).toMatch(/^VI-27-\d{2}$/);
		const ids = (u: SessionUser) =>
			listCampaigns(u, { today: TODAY }).then((l) => l.map((c) => c.id));
		expect(await ids(carlos)).toContain(id);
		expect(await ids(marta)).not.toContain(id);
		expect(await ids(ana)).not.toContain(id);
		expect(await getCampaignDetail(marta, id, TODAY)).toBeNull();
		const detail = await getCampaignDetail(carlos, id, TODAY);
		expect(detail!.milestones).toHaveLength(9);
		expect(detail!.milestones.find((m) => m.key === 'brief')!.dueOn).toBe('2027-05-06');
	});

	it('solo Administración y Operaciones crean o editan', async () => {
		await expect(createCampaign(marta, input({ brandCode: 'FH' }))).rejects.toBeInstanceOf(
			CampaignError
		);
		await expect(createCampaign(jorge, input({ ownerUserId: 'u-marta-ruiz' }))).rejects.toThrow(
			'responsable'
		);
	});

	it('los hitos usan los plazos de Ajustes y se recalculan al cambiar la fecha', async () => {
		await saveSettings(jorge, {
			milestoneOffsets: { ...MILESTONE_OFFSETS, brief: -60 },
			otifTarget: 98
		});
		expect((await getSettings()).otifTarget).toBe(98);
		const id = await createCampaign(jorge, input({ name: `Prueba ${RUN} plazos` }));
		created.push(id);
		const brief = async () =>
			(await getCampaignDetail(jorge, id, TODAY))!.milestones.find((m) => m.key === 'brief')!.dueOn;
		expect(await brief()).toBe('2027-04-16');
		await updateCampaign(jorge, id, {
			...input({ name: `Prueba ${RUN} plazos` }),
			inRestaurantOn: '2027-07-15'
		});
		expect(await brief()).toBe('2027-05-16');
	});

	it('soportes, duplicar como plantilla y archivar', async () => {
		const id = await createCampaign(jorge, input({ name: `Prueba ${RUN} plantilla` }));
		created.push(id);
		const sid = await saveSupport(
			jorge,
			id,
			{
				name: 'Cartel 70×100',
				versionsPlanned: 3,
				runQty: 500,
				perKitQty: 1,
				packaging: null,
				responsible: null,
				stage: 4,
				notes: null
			},
			null
		);
		const copy = await duplicateCampaign(jorge, id, {
			name: `Prueba ${RUN} copia`,
			inRestaurantOn: '2027-09-01'
		});
		created.push(copy);
		const d = await getCampaignDetail(jorge, copy, TODAY);
		expect(d!.campaign.templateOf).toBe(id);
		expect(d!.supports.map((s) => [s.name, s.stage])).toEqual([['Cartel 70×100', 0]]);
		await deleteSupport(jorge, id, sid);
		await setArchived(jorge, id, true);
		expect((await listCampaigns(carlos, { today: TODAY })).map((c) => c.id)).not.toContain(id);
		await setArchived(jorge, id, false);
		expect((await listCampaigns(carlos, { today: TODAY })).map((c) => c.id)).toContain(id);
	});

	it('no se elimina un soporte con artes finales', async () => {
		await expect(deleteSupport(jorge, 'FH-26-03', 'fh-cs')).rejects.toThrow('artes finales');
	});
});

describe('usuarios', () => {
	async function tempManager() {
		const id = randomUUID();
		tempUsers.push(id);
		await db.insert(tables.users).values({
			id,
			email: `fase2-${RUN}-${id.slice(0, 4)}@test.example`,
			name: `Temporal ${id.slice(0, 4)}`,
			role: 'manager'
		});
		await db.insert(tables.userRestaurants).values({ userId: id, restaurantId: 'FH-0147' });
		await db.insert(tables.sessions).values({
			id: randomUUID(),
			token: randomUUID(),
			userId: id,
			expiresAt: new Date(Date.now() + 3600_000)
		});
		return id;
	}
	const sessionsOf = async (id: string) =>
		(await db.select().from(tables.sessions).where(eq(tables.sessions.userId, id))).length;

	it('cambiar el ámbito cierra sus sesiones y queda auditado', async () => {
		const id = await tempManager();
		await updateAccess(marta, id, { role: 'manager', brands: [], restaurants: ['FH-0012'] });
		expect((await loadActor(id))!.restaurants.map((r) => r.id)).toEqual(['FH-0012']);
		expect(await sessionsOf(id)).toBe(0);
		const [a] = await db.select().from(tables.auditLog).where(eq(tables.auditLog.entityId, id));
		expect(a!.action).toBe('user.role_changed');
	});

	it('una marca no asciende ni gestiona fuera de su marca', async () => {
		const id = await tempManager();
		await expect(
			updateAccess(marta, id, { role: 'admin', brands: [], restaurants: [] })
		).rejects.toBeInstanceOf(UserAdminError);
		await expect(
			updateAccess(marta, id, { role: 'manager', brands: [], restaurants: ['VI-0023'] })
		).rejects.toThrow('No puedes');
		await expect(setSuspended(carlos, id, true)).rejects.toThrow('No puedes');
	});

	it('suspender cierra sesiones; eliminar anonimiza; nunca a uno mismo ni al último admin', async () => {
		const id = await tempManager();
		await setSuspended(jorge, id, true);
		expect(await sessionsOf(id)).toBe(0);
		expect((await loadActor(id))!.status).toBe('suspended');
		await deleteUser(jorge, id);
		const u = await loadActor(id);
		expect(u).toMatchObject({ status: 'deleted', name: 'Cuenta eliminada', restaurants: [] });
		expect(u!.email).not.toContain('fase2');
		await expect(setSuspended(jorge, jorge.id, true)).rejects.toThrow('propia');
	});
});

describe('maestro', () => {
	it('una marca edita los campos acordados de su marca y deja histórico', async () => {
		const before = (await getRestaurant(marta, 'FH-0061'))!;
		const changed = await updateRestaurant(marta, 'FH-0061', {
			language: 'CAT',
			deliveryPoint: 'Directo restaurante'
		});
		expect(changed).toEqual(['language']);
		expect((await getRestaurant(marta, 'FH-0061'))!.deliveryPoint).toBe(before.deliveryPoint);
		await updateRestaurant(marta, 'FH-0061', { language: before.language });
		await expect(updateRestaurant(marta, 'VI-0023', { name: 'x' })).rejects.toBeInstanceOf(
			MasterError
		);
		await expect(updateRestaurant(jorge, 'FH-0061', { tariff: 'M3' })).rejects.toThrow(
			'Tarifa no válida'
		);
	});

	it('importación: previsualiza, aplica en una transacción y no se aplica dos veces', async () => {
		const table = [
			[
				'Código',
				'Marca',
				'Nombre',
				'Ciudad',
				'Dirección',
				'Tarifa',
				'Idioma',
				'Surtido',
				'Fachada',
				'Entrega'
			],
			[
				'GI-9901',
				'GINOS',
				`Prueba ${RUN} Ginos`,
				'Bilbao',
				'Gran Vía 1',
				'M3',
				'CAST',
				'Completa',
				'',
				'Plataforma Promopicking'
			]
		];
		await expect(previewImport(marta, 'x.csv', table)).rejects.toBeInstanceOf(MasterError);
		const id = await previewImport(jorge, 'ginos.csv', table);
		const res = await applyImport(jorge, id);
		// Las 8 de Ginos que no vienen en el fichero se proponen como baja.
		expect(res).toEqual({ added: 1, changed: 0, removed: 8 });
		await expect(applyImport(jorge, id)).rejects.toThrow('ya no está pendiente');
		expect((await getRestaurant(jorge, 'GI-9901'))!.name).toBe(`Prueba ${RUN} Ginos`);
		expect((await getRestaurant(jorge, 'GI-0231'))!.active).toBe(false);
		await db
			.update(tables.restaurants)
			.set({ active: true })
			.where(like(tables.restaurants.id, 'GI-%'));
	});
});
