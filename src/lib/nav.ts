import type { Component } from 'svelte';
import Megaphone from '@lucide/svelte/icons/megaphone';
import FileCheck from '@lucide/svelte/icons/file-check';
import Package from '@lucide/svelte/icons/package';
import PackageCheck from '@lucide/svelte/icons/package-check';
import QrCode from '@lucide/svelte/icons/qr-code';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Store from '@lucide/svelte/icons/store';
import LifeBuoy from '@lucide/svelte/icons/life-buoy';
import UserCog from '@lucide/svelte/icons/user-cog';
import { can, type Action, type Actor, type Role } from '$lib/permissions';

export type NavIcon = Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

export type NavItem = {
	href: string;
	/** Nombre completo (sidebar de 232 px). */
	label: string;
	/** Etiqueta corta de una línea (sidebar de 72 px y barra inferior; 7.5, regla 4). */
	short: string;
	icon: NavIcon;
	action: Action;
	/** Contador en la esquina del icono. */
	count?: 'pending' | 'incidents';
	roles?: Role[];
};

export const NAV: NavItem[] = [
	{
		href: '/campanas',
		label: 'Campañas',
		short: 'Campañas',
		icon: Megaphone,
		action: 'campaign.view'
	},
	{
		href: '/aprobaciones',
		label: 'Aprobación de artes',
		short: 'Aprobaciones',
		icon: FileCheck,
		action: 'artwork.view',
		count: 'pending'
	},
	{
		href: '/kits',
		label: 'Kits y etiquetas',
		short: 'Kits',
		icon: Package,
		action: 'kit.view',
		roles: ['admin', 'ops', 'production', 'brand']
	},
	{
		href: '/kits/recepcion',
		label: 'Recepción de kits',
		short: 'Recepción',
		icon: PackageCheck,
		action: 'kit.receive',
		roles: ['manager']
	},
	{ href: '/qr', label: 'QR de versión', short: 'QR', icon: QrCode, action: 'qr.view' },
	{
		href: '/reposiciones',
		label: 'Reposiciones',
		short: 'Reposiciones',
		icon: ShoppingCart,
		action: 'order.place'
	},
	{
		href: '/informes',
		label: 'Informes',
		short: 'Informes',
		icon: ChartColumn,
		action: 'report.view'
	},
	{
		href: '/maestro',
		label: 'Maestro de restaurantes',
		short: 'Maestro',
		icon: Store,
		action: 'restaurant.view'
	},
	{
		href: '/soporte',
		label: 'Soporte e incidencias',
		short: 'Soporte',
		icon: LifeBuoy,
		action: 'ticket.view',
		count: 'incidents'
	},
	{
		href: '/admin',
		label: 'Administración',
		short: 'Admin',
		icon: UserCog,
		action: 'user.invite'
	}
];

/** Destinos de la barra inferior en móvil (8.2); el quinto es «Más». */
const TABS: Record<'default' | 'manager', string[]> = {
	default: ['/campanas', '/aprobaciones', '/kits', '/soporte'],
	manager: ['/campanas', '/kits/recepcion', '/reposiciones', '/soporte']
};

export function navFor(actor: Actor): NavItem[] {
	return NAV.filter((n) => (!n.roles || n.roles.includes(actor.role)) && can(actor, n.action));
}

export function tabsFor(actor: Actor): { tabs: NavItem[]; more: NavItem[] } {
	const items = navFor(actor);
	const wanted = TABS[actor.role === 'manager' ? 'manager' : 'default'];
	const tabs = wanted.map((h) => items.find((n) => n.href === h)).filter((n): n is NavItem => !!n);
	return { tabs, more: items.filter((n) => !tabs.includes(n)) };
}

export function isActive(href: string, pathname: string): boolean {
	if (href === '/kits')
		return (
			pathname === '/kits' ||
			(pathname.startsWith('/kits/') && !pathname.startsWith('/kits/recepcion'))
		);
	return pathname === href || pathname.startsWith(href + '/');
}
