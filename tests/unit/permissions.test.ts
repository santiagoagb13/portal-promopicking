import { describe, expect, it } from 'vitest';
import { can, visibleBrands, type Action, type Actor, type Role } from '$lib/permissions';

const actor = (role: Role, extra: Partial<Actor> = {}): Actor => ({
	id: `u-${role}`,
	role,
	status: 'active',
	brands: [],
	restaurants: [],
	...extra
});

const admin = actor('admin');
const ops = actor('ops');
const production = actor('production');
const marta = actor('brand', { id: 'marta', brands: ['FH'] });
const ana = actor('manager', { id: 'ana', restaurants: [{ id: 'FH-0147', brandCode: 'FH' }] });

describe('can() · matriz de la sección 4.2', () => {
	it.each<[Action, Record<string, boolean>]>([
		[
			'campaign.create',
			{ admin: true, ops: true, production: false, brand: false, manager: false }
		],
		['campaign.edit', { admin: true, ops: true, production: false, brand: false, manager: false }],
		['artwork.upload', { admin: true, ops: true, production: true, brand: false, manager: false }],
		['audit.view', { admin: true, ops: false, production: false, brand: false, manager: false }]
	])('%s', (action, expected) => {
		const actors = { admin, ops, production, brand: marta, manager: ana };
		for (const [role, a] of Object.entries(actors))
			expect(can(a, action), `${role}`).toBe(expected[role]);
	});

	it('ver campañas: internos todas; marca solo la suya; gerente las de su restaurante', () => {
		for (const a of [admin, ops, production])
			expect(can(a, 'campaign.view', { brandCode: 'VIPS' })).toBe(true);
		expect(can(marta, 'campaign.view', { brandCode: 'FH' })).toBe(true);
		expect(can(marta, 'campaign.view', { brandCode: 'VIPS' })).toBe(false);
		expect(can(ana, 'campaign.view', { brandCode: 'FH' })).toBe(true);
		expect(can(ana, 'campaign.view', { brandCode: 'GINOS' })).toBe(false);
		// Con reparto ya generado, solo si un kit es para su restaurante.
		expect(
			can(ana, 'campaign.view', { brandCode: 'FH', restaurantIds: ['FH-0147', 'FH-0012'] })
		).toBe(true);
		expect(can(ana, 'campaign.view', { brandCode: 'FH', restaurantIds: ['FH-0012'] })).toBe(false);
	});

	it('aprobar artes: solo marketing de la marca, nunca internos', () => {
		expect(can(marta, 'artwork.decide', { brandCode: 'FH' })).toBe(true);
		expect(can(marta, 'artwork.decide', { brandCode: 'GINOS' })).toBe(false);
		for (const a of [admin, ops, production, ana])
			expect(can(a, 'artwork.decide', { brandCode: 'FH' })).toBe(false);
	});

	it('escanear kits: producción solo la expedición', () => {
		expect(can(production, 'kit.scan', { scanStep: 'shipped' })).toBe(true);
		expect(can(production, 'kit.scan', { scanStep: 'hub_in' })).toBe(false);
		expect(can(ops, 'kit.scan', { scanStep: 'out_for_delivery' })).toBe(true);
		expect(can(marta, 'kit.scan')).toBe(false);
		expect(can(ana, 'kit.scan')).toBe(false);
	});

	it('recepción e incidencias: el gerente solo en su restaurante', () => {
		expect(can(ana, 'kit.receive', { restaurantId: 'FH-0147' })).toBe(true);
		expect(can(ana, 'kit.receive', { restaurantId: 'FH-0012' })).toBe(false);
		expect(can(ana, 'incident.open', { restaurantId: 'FH-0147' })).toBe(true);
		expect(can(production, 'kit.receive', { restaurantId: 'FH-0147' })).toBe(false);
		expect(can(marta, 'incident.open', { restaurantId: 'FH-0147' })).toBe(false);
	});

	it('reposiciones: marca en nombre de un restaurante de su marca; gerente el suyo', () => {
		expect(can(marta, 'order.place', { brandCode: 'FH', restaurantId: 'FH-0147' })).toBe(true);
		expect(can(marta, 'order.place', { brandCode: 'VIPS', restaurantId: 'VI-0023' })).toBe(false);
		expect(can(ana, 'order.place', { restaurantId: 'FH-0147' })).toBe(true);
		expect(can(ana, 'order.place', { restaurantId: 'FH-0012' })).toBe(false);
		expect(can(production, 'order.place')).toBe(false);
	});

	it('maestro: internos y marca de su marca; ni producción ni gerentes', () => {
		expect(can(marta, 'restaurant.edit', { brandCode: 'FH' })).toBe(true);
		expect(can(marta, 'restaurant.edit', { brandCode: 'GINOS' })).toBe(false);
		expect(can(production, 'restaurant.edit', { brandCode: 'FH' })).toBe(false);
		expect(can(ana, 'restaurant.view', { brandCode: 'FH' })).toBe(false);
	});

	it('tickets: producción y marca responden los suyos; el gerente no', () => {
		expect(can(production, 'ticket.respond', { openedBy: production.id })).toBe(true);
		expect(can(production, 'ticket.respond', { openedBy: 'otro' })).toBe(false);
		expect(can(marta, 'ticket.respond', { openedBy: 'otro', brandCode: 'FH' })).toBe(true);
		expect(can(marta, 'ticket.respond', { openedBy: 'otro', brandCode: 'VIPS' })).toBe(false);
		expect(can(ana, 'ticket.respond', { openedBy: ana.id })).toBe(false);
	});

	it('invitar: admin cualquier rol; marca solo gerentes de su marca', () => {
		expect(can(admin, 'user.invite', { targetRole: 'ops' })).toBe(true);
		expect(
			can(marta, 'user.invite', { targetRole: 'manager', targetRestaurantBrands: ['FH'] })
		).toBe(true);
		expect(
			can(marta, 'user.invite', { targetRole: 'manager', targetRestaurantBrands: ['FH', 'VIPS'] })
		).toBe(false);
		expect(can(marta, 'user.invite', { targetRole: 'brand', targetBrands: ['FH'] })).toBe(false);
		expect(can(marta, 'user.invite', { targetRole: 'manager', targetRestaurantBrands: [] })).toBe(
			false
		);
		for (const a of [ops, production, ana]) expect(can(a, 'user.invite')).toBe(false);
		expect(can(marta, 'user.changeRole', { targetRole: 'admin' })).toBe(false);
	});

	it('una cuenta suspendida o ausente no puede nada', () => {
		const suspended = actor('admin', { status: 'suspended' });
		expect(can(suspended, 'campaign.view')).toBe(false);
		expect(can(null, 'ticket.view')).toBe(false);
		expect(can(undefined, 'campaign.view')).toBe(false);
	});

	it('visibleBrands', () => {
		expect(visibleBrands(admin)).toBeNull();
		expect(visibleBrands(marta)).toEqual(['FH']);
		expect(visibleBrands(ana)).toEqual(['FH']);
	});
});
