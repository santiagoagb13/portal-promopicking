import { currentDb, tables } from './db';

export type AuditEntry = {
	userId?: string | null;
	action: string;
	entity?: string;
	entityId?: string;
	before?: unknown;
	after?: unknown;
	ip?: string | null;
	userAgent?: string | null;
};

/** Añade una entrada al registro de auditoría (inmutable: la BD rechaza UPDATE y DELETE). */
export async function audit(entry: AuditEntry): Promise<void> {
	await currentDb()
		.insert(tables.auditLog)
		.values({
			userId: entry.userId ?? null,
			action: entry.action,
			entity: entry.entity ?? null,
			entityId: entry.entityId ?? null,
			before: entry.before ?? null,
			after: entry.after ?? null,
			ip: entry.ip ?? null,
			userAgent: entry.userAgent?.slice(0, 400) ?? null
		});
}

/** IP y agente de usuario de una petición, para la auditoría. */
export function requestMeta(request: Request, ip?: string | null) {
	return { ip: ip ?? null, userAgent: request.headers.get('user-agent') };
}
