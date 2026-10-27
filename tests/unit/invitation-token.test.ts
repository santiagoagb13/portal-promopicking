import { describe, expect, it } from 'vitest';
import {
	hashToken,
	invitationExpiry,
	invitationState,
	isWellFormedToken,
	newInvitationToken
} from '$lib/server/auth/invitation-token';
import { safeBack } from '$lib/safe-back';

describe('token de invitación', () => {
	it('tiene 256 bits en base64url y no se repite', () => {
		const tokens = new Set(Array.from({ length: 200 }, newInvitationToken));
		expect(tokens.size).toBe(200);
		for (const t of tokens) {
			expect(isWellFormedToken(t)).toBe(true);
			expect(Buffer.from(t, 'base64url')).toHaveLength(32);
		}
	});

	it('en la BD solo va el SHA-256, que no revela el token', () => {
		const t = newInvitationToken();
		expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
		expect(hashToken(t)).toBe(hashToken(t));
		expect(hashToken(t)).not.toContain(t);
	});

	it('rechaza tokens mal formados antes de consultar', () => {
		for (const bad of ['', 'abc', 'x'.repeat(44), '../../etc/passwd', 'a'.repeat(42) + '='])
			expect(isWellFormedToken(bad)).toBe(false);
	});

	it('estado: revocada > usada > caducada > pendiente', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const future = new Date('2026-10-29T10:00:00Z');
		const past = new Date('2026-10-21T10:00:00Z');
		expect(invitationState({ usedAt: null, revokedAt: null, expiresAt: future }, now)).toBe(
			'pending'
		);
		expect(invitationState({ usedAt: null, revokedAt: null, expiresAt: past }, now)).toBe(
			'expired'
		);
		expect(invitationState({ usedAt: now, revokedAt: null, expiresAt: future }, now)).toBe('used');
		expect(invitationState({ usedAt: now, revokedAt: now, expiresAt: past }, now)).toBe('revoked');
		expect(invitationState({ usedAt: null, revokedAt: null, expiresAt: now }, now)).toBe('expired');
	});

	it('caduca a los 7 días', () => {
		const from = new Date('2026-10-22T10:00:00Z');
		expect(invitationExpiry(from).toISOString()).toBe('2026-10-29T10:00:00.000Z');
	});
});

describe('destino tras entrar', () => {
	it('solo acepta rutas internas', () => {
		expect(safeBack('/campanas?marca=FH')).toBe('/campanas?marca=FH');
		for (const bad of [
			null,
			'',
			'https://evil.example',
			'//evil.example',
			'/\\evil.example',
			'/api/auth/sign-out'
		])
			expect(safeBack(bad)).toBe('/campanas');
	});
});
