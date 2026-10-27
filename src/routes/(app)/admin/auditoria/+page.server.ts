import { asc, ne } from 'drizzle-orm';
import { db, tables } from '$lib/server/db';
import {
	AUDIT_PAGE,
	auditActions,
	auditFiltersFrom as filtersFrom,
	listAudit
} from '$lib/server/services/users';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const filters = filtersFrom(url.searchParams);
	const page = Math.max(1, Number(url.searchParams.get('pagina')) || 1);
	const [{ rows, total }, actions, people] = await Promise.all([
		listAudit(filters, page),
		auditActions(),
		db
			.select({ id: tables.users.id, name: tables.users.name })
			.from(tables.users)
			.where(ne(tables.users.status, 'deleted'))
			.orderBy(asc(tables.users.name))
	]);
	return {
		title: 'Auditoría',
		rows,
		total,
		page,
		pages: Math.max(1, Math.ceil(total / AUDIT_PAGE)),
		filters,
		actions,
		people
	};
};
