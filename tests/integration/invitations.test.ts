/**
 * Integración con Postgres (requiere `docker compose up`, migraciones y seed): flujo de invitación
 * completo sobre el servicio, sin navegador.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { closeDb, db, tables } from '$lib/server/db';
import {
	acceptInvitation,
	createInvitation,
	findInvitationByToken,
	InvitationError,
	listOpenInvitations,
	resendInvitation,
	revokeInvitation
} from '$lib/server/services/invitations';

const RUN = randomUUID().slice(0, 8);
const email = (n: string) => `prueba-${RUN}-${n}@test.example`;
let jorge: SessionUser;
let marta: SessionUser;

beforeAll(async () => {
	jorge = (await loadActor('u-jorge-martin'))!;
	marta = (await loadActor('u-marta-ruiz'))!;
	expect(jorge?.role).toBe('admin');
	expect(marta?.role).toBe('brand');
});

afterAll(async () => {
	await db.delete(tables.users).where(like(tables.users.email, `prueba-${RUN}-%`));
	await db.delete(tables.invitations).where(like(tables.invitations.email, `prueba-${RUN}-%`));
	await closeDb();
});

const manager = (e: string, restaurants: string[]) => ({
	email: e,
	name: 'Prueba',
	role: 'manager' as const,
	brands: [],
	restaurants
});

describe('invitaciones', () => {
	it('una marca invita gerentes de su marca, no de otra ni otros roles', async () => {
		const { token } = await createInvitation(marta, manager(email('a'), ['FH-0147']));
		expect((await findInvitationByToken(token))?.state).toBe('pending');
		await expect(createInvitation(marta, manager(email('b'), ['VI-0023']))).rejects.toBeInstanceOf(
			InvitationError
		);
		await expect(
			createInvitation(marta, {
				email: email('c'),
				name: '',
				role: 'ops',
				brands: [],
				restaurants: []
			})
		).rejects.toThrow('No puedes invitar');
	});

	it('no duplica invitaciones pendientes ni invita cuentas existentes', async () => {
		await createInvitation(jorge, manager(email('d'), ['FH-0012']));
		await expect(createInvitation(jorge, manager(email('d'), ['FH-0012']))).rejects.toThrow(
			'pendiente'
		);
		await expect(
			createInvitation(jorge, manager('marta.ruiz@alsea.example', ['FH-0012']))
		).rejects.toThrow('Ya existe');
	});

	it('valida el ámbito según el rol', async () => {
		await expect(
			createInvitation(jorge, { ...manager(email('e'), []), restaurants: [] })
		).rejects.toThrow('restaurante');
		await expect(
			createInvitation(jorge, {
				email: email('f'),
				name: '',
				role: 'brand',
				brands: ['XX'],
				restaurants: []
			})
		).rejects.toThrow('Marca desconocida');
	});

	it('solo guarda el hash; reenviar invalida el enlace anterior', async () => {
		const { id, token } = await createInvitation(jorge, manager(email('g'), ['FH-0147']));
		const [row] = await db.select().from(tables.invitations).where(eq(tables.invitations.id, id));
		expect(row!.tokenHash).not.toContain(token);
		expect(JSON.stringify(row)).not.toContain(token);
		const { token: fresh } = await resendInvitation(jorge, id);
		expect(await findInvitationByToken(token)).toBeNull();
		expect((await findInvitationByToken(fresh))?.state).toBe('pending');
	});

	it('aceptar crea la cuenta con su ámbito, una sola vez y en una transacción', async () => {
		const { token, id } = await createInvitation(
			jorge,
			manager(email('h'), ['FH-0147', 'FH-0012'])
		);
		const userId = randomUUID();
		await db.transaction((tx) => acceptInvitation({ token, userId, name: '  Nueva Gerente ' }, tx));
		const user = await loadActor(userId);
		expect(user).toMatchObject({ role: 'manager', name: 'Nueva Gerente', email: email('h') });
		expect(user!.restaurants.map((r) => r.id).sort()).toEqual(['FH-0012', 'FH-0147']);
		expect((await findInvitationByToken(token))?.state).toBe('used');
		await expect(
			db.transaction((tx) => acceptInvitation({ token, userId: randomUUID(), name: 'Otra' }, tx))
		).rejects.toThrow('no está disponible');
		const audit = await db.select().from(tables.auditLog).where(eq(tables.auditLog.entityId, id));
		expect(audit.map((a) => a.action)).toEqual(
			expect.arrayContaining(['invitation.created', 'invitation.accepted'])
		);
	});

	it('si algo falla al aceptar no queda nada a medias', async () => {
		const { token } = await createInvitation(jorge, manager(email('i'), ['FH-0147']));
		const userId = randomUUID();
		await expect(
			db.transaction(async (tx) => {
				await acceptInvitation({ token, userId, name: 'Fallida' }, tx);
				throw new Error('falla la passkey');
			})
		).rejects.toThrow('falla la passkey');
		expect(await loadActor(userId)).toBeNull();
		expect((await findInvitationByToken(token))?.state).toBe('pending');
	});

	it('revocar deja el enlace inservible; la marca solo gestiona las suyas', async () => {
		const { id, token } = await createInvitation(jorge, manager(email('j'), ['VI-0023']));
		await expect(revokeInvitation(marta, id)).rejects.toThrow('No puedes');
		await revokeInvitation(jorge, id);
		expect((await findInvitationByToken(token))?.state).toBe('revoked');
		await expect(resendInvitation(jorge, id)).rejects.toThrow('ya no está pendiente');
		const visible = await listOpenInvitations(marta);
		expect(visible.every((i) => i.role === 'manager')).toBe(true);
		expect(visible.some((i) => i.email === email('j'))).toBe(false);
	});

	it('el registro de auditoría es inmutable', async () => {
		const rows = await db.select({ id: tables.auditLog.id }).from(tables.auditLog).limit(1);
		await expect(
			db.delete(tables.auditLog).where(
				inArray(
					tables.auditLog.id,
					rows.map((r) => r.id)
				)
			)
		).rejects.toThrow();
	});
});
