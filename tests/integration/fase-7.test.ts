/** Integración de la fase 7: datos de la empresa en Ajustes y preferencia de avisos por correo. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { loadActor, type SessionUser } from '$lib/server/auth/actor';
import { config } from '$lib/server/config';
import { closeDb, db, tables } from '$lib/server/db';
import { EMPTY_COMPANY, getSettings, saveSettings } from '$lib/server/services/settings';
import { createTicket, replyTicket } from '$lib/server/services/tickets';

const T = tables;
let jorge: SessionUser, ana: SessionUser;
const created: string[] = [];
const outbox = () => join(config.mailOutboxDir, 'outbox.jsonl');
const mailsTo = (to: string) =>
	existsSync(outbox())
		? readFileSync(outbox(), 'utf8')
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l) as { to: string; tag?: string })
				.filter((m) => m.to === to && m.tag === 'ticket').length
		: 0;

beforeAll(async () => {
	[jorge, ana] = (await Promise.all(['u-jorge-martin', 'u-ana-soler'].map(loadActor))) as [
		SessionUser,
		SessionUser
	];
});

afterAll(async () => {
	await db.update(T.users).set({ notifyEmail: true }).where(eq(T.users.id, ana.id));
	if (created.length) await db.delete(T.tickets).where(inArray(T.tickets.id, created));
	const s = await getSettings();
	await saveSettings(jorge, { ...s, company: EMPTY_COMPANY });
	await closeDb();
});

describe('ajustes', () => {
	it('los datos de la empresa se guardan sin tocar el resto', async () => {
		const before = await getSettings();
		await saveSettings(jorge, {
			...before,
			company: {
				name: 'Empresa de prueba',
				taxId: 'B00000000',
				address: 'Calle 1',
				email: 'privacidad@example.com'
			}
		});
		const after = await getSettings();
		expect(after.company.name).toBe('Empresa de prueba');
		expect(after.otifTarget).toBe(before.otifTarget);
		// Guardar sin `company` (como antes de la fase 7) no la borra.
		await saveSettings(jorge, {
			milestoneOffsets: after.milestoneOffsets,
			otifTarget: after.otifTarget
		});
		expect((await getSettings()).company.email).toBe('privacidad@example.com');
	});
});

describe('avisos por correo', () => {
	it('con «solo la campana» no llega correo, pero sí el aviso', async () => {
		const id = await createTicket(ana, {
			type: 'query',
			kind: 'Plazos',
			campaignId: null,
			restaurantId: 'FH-0147',
			text: 'Consulta de prueba de avisos'
		});
		created.push(id);
		await db.update(T.users).set({ notifyEmail: false }).where(eq(T.users.id, ana.id));
		const before = mailsTo(ana.email);
		await replyTicket(jorge, id, 'Respuesta sin correo', null);
		expect(mailsTo(ana.email)).toBe(before);
		await db.update(T.users).set({ notifyEmail: true }).where(eq(T.users.id, ana.id));
		await replyTicket(jorge, id, 'Respuesta con correo', null);
		expect(mailsTo(ana.email)).toBe(before + 1);
		const notes = await db.select().from(T.notifications).where(eq(T.notifications.entityId, id));
		expect(notes.filter((n) => n.userId === ana.id)).toHaveLength(2);
		await db.delete(T.notifications).where(eq(T.notifications.entityId, id));
	});
});
