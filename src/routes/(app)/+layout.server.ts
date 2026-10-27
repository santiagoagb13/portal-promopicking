import { error } from '@sveltejs/kit';
import { and, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { navFor, tabsFor } from '$lib/nav';
import { can, visibleBrands } from '$lib/permissions';
import { ROLE_LABEL } from '$lib/i18n/es';
import { sectionAction } from '$lib/server/auth/guards';
import { db, tables } from '$lib/server/db';
import { campaignScope } from '$lib/server/services/campaigns';
import type { LayoutServerLoad } from './$types';

const { notifications, supportVersions, supports, campaigns, tickets, brands, restaurants } = tables;

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((w) => w[0] ?? '')
		.join('')
		.slice(0, 2)
		.toUpperCase();
}

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
	depends('app:shell');
	const user = locals.user;
	if (!user) error(401, 'Sesión caducada');
	// Segunda barrera tras hooks.server.ts: la página de una sección sin permiso es un 403.
	const action = sectionAction(url.pathname);
	if (action && !can(user, action)) error(403, 'No tienes acceso a esta sección');

	const scope = campaignScope(user);
	const [unread, pending, incidents, scopeNames] = await Promise.all([
		db
			.select({ n: count() })
			.from(notifications)
			.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
		can(user, 'artwork.view')
			? db
					.select({ n: count() })
					.from(supportVersions)
					.innerJoin(supports, eq(supports.id, supportVersions.supportId))
					.innerJoin(campaigns, eq(campaigns.id, supports.campaignId))
					.where(and(ne(supportVersions.status, 'approved'), scope))
			: [{ n: 0 }],
		db
			.select({ n: count() })
			.from(tickets)
			.innerJoin(campaigns, eq(campaigns.id, tickets.campaignId))
			.where(and(eq(tickets.type, 'incident'), ne(tickets.state, 'closed'), scope)),
		user.role === 'manager'
			? db
					.select({ name: restaurants.name })
					.from(restaurants)
					.where(inArray(restaurants.id, user.restaurants.map((r) => r.id)))
			: user.role === 'brand'
				? db.select({ name: brands.short }).from(brands).where(inArray(brands.code, visibleBrands(user) ?? []))
				: []
	]);

	const subtitle = [ROLE_LABEL[user.role], scopeNames.map((s) => s.name).join(', ') || user.organization]
		.filter(Boolean)
		.join(' · ');
	const nav = navFor(user).map(({ href }) => href);
	const { tabs, more } = tabsFor(user);
	return {
		user: { id: user.id, name: user.name, email: user.email, role: user.role, initials: initials(user.name), subtitle },
		actor: { id: user.id, role: user.role, status: user.status, brands: user.brands, restaurants: user.restaurants },
		nav,
		tabs: tabs.map((t) => t.href),
		more: more.map((t) => t.href),
		counts: { pending: pending[0]?.n ?? 0, incidents: incidents[0]?.n ?? 0 },
		unread: unread[0]?.n ?? 0
	};
};
