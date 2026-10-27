import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_TTL_DAYS = 7;

/** Token de invitación: 256 bits aleatorios en base64url (43 caracteres). */
export function newInvitationToken(): string {
	return randomBytes(32).toString('base64url');
}

/** En la BD solo se guarda el SHA-256 del token. */
export function hashToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedToken(token: string): boolean {
	return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type InvitationState = 'pending' | 'expired' | 'used' | 'revoked';

export function invitationState(
	inv: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
	now = new Date()
): InvitationState {
	if (inv.revokedAt) return 'revoked';
	if (inv.usedAt) return 'used';
	if (inv.expiresAt.getTime() <= now.getTime()) return 'expired';
	return 'pending';
}

export function invitationExpiry(from = new Date()): Date {
	return new Date(from.getTime() + INVITATION_TTL_DAYS * 86_400_000);
}
