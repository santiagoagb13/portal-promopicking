import { can } from '$lib/permissions';
import type { LayoutServerLoad } from './$types';

/** Pestañas de Administración según el rol (8.12). */
export const load: LayoutServerLoad = ({ locals }) => {
	const u = locals.user!;
	return {
		adminTabs: [
			{ href: '/admin/usuarios', label: 'Usuarios', show: can(u, 'user.invite') },
			{ href: '/admin/invitaciones', label: 'Invitaciones', show: can(u, 'user.invite') },
			{ href: '/admin/auditoria', label: 'Auditoría', show: can(u, 'audit.view') },
			{ href: '/admin/ajustes', label: 'Ajustes', show: can(u, 'settings.edit') }
		].filter((t) => t.show)
	};
};
