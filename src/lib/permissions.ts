/**
 * Permisos del portal (sección 4.2 del plan): `can(usuario, acción, recurso)`.
 *
 * El servidor lo aplica en `hooks.server.ts`, en cada carga y en cada acción; el cliente solo lo usa
 * para ocultar lo que no se puede hacer. El ámbito (marcas o restaurantes) viene de las tablas
 * `user_brands` y `user_restaurants`, no del rol.
 */

export const ROLES = ['admin', 'ops', 'production', 'brand', 'manager'] as const;
export type Role = (typeof ROLES)[number];

export type Actor = {
	id: string;
	role: Role;
	status: 'active' | 'suspended' | 'deleted';
	/** Marcas del ámbito (usuarios de marca). */
	brands: string[];
	/** Restaurantes del ámbito (gerentes), con su marca. */
	restaurants: { id: string; brandCode: string }[];
};

export type ScanStep = 'shipped' | 'hub_in' | 'out_for_delivery';

export type Action =
	| 'campaign.view'
	| 'campaign.create'
	| 'campaign.edit'
	| 'report.view'
	| 'artwork.view'
	| 'artwork.upload'
	| 'artwork.decide'
	| 'kit.view'
	| 'kit.scan'
	| 'kit.receive'
	| 'incident.open'
	| 'qr.view'
	| 'order.place'
	| 'restaurant.view'
	| 'restaurant.edit'
	| 'restaurant.create'
	| 'restaurant.import'
	| 'master.validate'
	| 'ticket.view'
	| 'ticket.respond'
	| 'user.invite'
	| 'user.changeRole'
	| 'audit.view'
	| 'settings.edit';

/** Recurso sobre el que se pregunta. Sin recurso, la pregunta es «¿puede hacerlo en algún caso?». */
export type Resource = {
	brandCode?: string;
	restaurantId?: string;
	/** Restaurantes que reciben la campaña (kits); vacío o ausente = aún sin reparto. */
	restaurantIds?: string[];
	scanStep?: ScanStep;
	/** Ticket: quién lo abrió. */
	openedBy?: string | null;
	/** Invitación o cambio de rol: rol destino y marcas de los restaurantes del ámbito destino. */
	targetRole?: Role;
	targetBrands?: string[];
	targetRestaurantBrands?: string[];
};

const INTERNAL: Role[] = ['admin', 'ops'];

export function managerBrands(actor: Actor): string[] {
	return [...new Set(actor.restaurants.map((r) => r.brandCode))];
}

function inBrands(actor: Actor, brand?: string): boolean {
	return brand === undefined ? actor.brands.length > 0 : actor.brands.includes(brand);
}

function inRestaurants(actor: Actor, restaurantId?: string): boolean {
	return restaurantId === undefined
		? actor.restaurants.length > 0
		: actor.restaurants.some((r) => r.id === restaurantId);
}

/** El gerente ve lo que afecta a su restaurante: la marca coincide y, si ya hay reparto, le llega un kit. */
function managerSees(actor: Actor, r?: Resource): boolean {
	if (!r?.brandCode) return actor.restaurants.length > 0;
	if (!managerBrands(actor).includes(r.brandCode)) return false;
	if (r.restaurantIds && r.restaurantIds.length > 0)
		return r.restaurantIds.some((id) => actor.restaurants.some((x) => x.id === id));
	return true;
}

export function can(actor: Actor | null | undefined, action: Action, r?: Resource): boolean {
	if (!actor || actor.status !== 'active') return false;
	const { role } = actor;
	const internal = INTERNAL.includes(role);

	switch (action) {
		case 'campaign.view':
		case 'report.view':
			if (internal || role === 'production') return true;
			if (role === 'brand') return inBrands(actor, r?.brandCode);
			return managerSees(actor, r);

		case 'campaign.create':
		case 'campaign.edit':
			return internal;

		case 'artwork.view':
			if (internal || role === 'production') return true;
			return role === 'brand' && inBrands(actor, r?.brandCode);

		case 'artwork.upload':
			return internal || role === 'production';

		case 'artwork.decide':
			return role === 'brand' && inBrands(actor, r?.brandCode);

		case 'kit.view':
			if (internal || role === 'production') return true;
			if (role === 'brand') return inBrands(actor, r?.brandCode);
			return inRestaurants(actor, r?.restaurantId);

		case 'kit.scan':
			if (internal) return true;
			return role === 'production' && (r?.scanStep === undefined || r.scanStep === 'shipped');

		case 'kit.receive':
		case 'incident.open':
			if (internal) return true;
			return role === 'manager' && inRestaurants(actor, r?.restaurantId);

		case 'qr.view':
			return (
				internal || role === 'production' || (role === 'brand' && inBrands(actor, r?.brandCode))
			);

		case 'order.place':
			if (internal) return true;
			if (role === 'brand') return inBrands(actor, r?.brandCode);
			return role === 'manager' && inRestaurants(actor, r?.restaurantId);

		case 'restaurant.view':
		case 'restaurant.edit':
		case 'master.validate':
			if (internal) return true;
			return role === 'brand' && inBrands(actor, r?.brandCode);

		// Altas, bajas e importación del maestro: solo Promopicking.
		case 'restaurant.create':
		case 'restaurant.import':
			return internal;

		case 'ticket.view':
			return true;

		case 'ticket.respond':
			if (internal) return true;
			if (role === 'production') return r?.openedBy === undefined || r.openedBy === actor.id;
			if (role === 'brand')
				return (
					r?.openedBy === undefined || r.openedBy === actor.id || inBrands(actor, r?.brandCode)
				);
			return false;

		case 'user.invite':
		case 'user.changeRole':
			if (role === 'admin') return true;
			if (role !== 'brand') return false;
			// Un usuario de marca solo invita gerentes de restaurantes de su marca.
			if (r?.targetRole === undefined) return true;
			if (r.targetRole !== 'manager') return false;
			if (!r.targetRestaurantBrands || r.targetRestaurantBrands.length === 0) return false;
			return r.targetRestaurantBrands.every((b) => actor.brands.includes(b));

		case 'audit.view':
		case 'settings.edit':
			return role === 'admin';
	}
}

/** Marcas visibles para el actor; `null` = todas. */
export function visibleBrands(actor: Actor): string[] | null {
	if (actor.role === 'brand') return actor.brands;
	if (actor.role === 'manager') return managerBrands(actor);
	return null;
}
