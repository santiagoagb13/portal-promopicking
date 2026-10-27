import { toCsv } from '$lib/domain/master';
import { fmtDateTime } from '$lib/domain/dates';
import { audit } from '$lib/server/audit';
import { auditFiltersFrom, listAudit } from '$lib/server/services/users';
import type { RequestHandler } from './$types';

/** CSV de la auditoría con los filtros de la página (hasta 20 000 filas). */
export const GET: RequestHandler = async ({ url, locals, request, getClientAddress }) => {
	const filters = auditFiltersFrom(url.searchParams);
	const { rows } = await listAudit(filters, 1, 20_000);
	const csv = toCsv([
		['Fecha', 'Usuario', 'Acción', 'Entidad', 'Id', 'Antes', 'Después', 'IP'],
		...rows.map((r) => [
			fmtDateTime(r.at),
			r.userName ?? r.userId ?? '',
			r.action,
			r.entity ?? '',
			r.entityId ?? '',
			r.before ? JSON.stringify(r.before) : '',
			r.after ? JSON.stringify(r.after) : '',
			r.ip ?? ''
		])
	]);
	await audit({
		userId: locals.user!.id,
		action: 'audit.exported',
		after: { ...filters, rows: rows.length },
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent')
	});
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
			'cache-control': 'private, no-store'
		}
	});
};
