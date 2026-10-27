import { fail } from '@sveltejs/kit';
import { addDays, fmtDay, todayDay } from '$lib/domain/dates';
import { cartLead, cartTotal, money, ORDER_STATES, parseCart } from '$lib/domain/orders';
import { z } from '$lib/schemas/z';
import {
	catalogFor,
	listOrders,
	OrderError,
	orderRestaurants,
	placeOrder
} from '$lib/server/services/orders';
import type { Actions, PageServerLoad } from './$types';

const internal = (role: string) => role === 'admin' || role === 'ops';

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = locals.user!;
	const vista = url.searchParams.get('vista') === 'pedidos' ? 'pedidos' : 'catalogo';
	const restaurants = await orderRestaurants(actor);
	const selected =
		restaurants.find((r) => r.id === url.searchParams.get('r')) ?? restaurants[0] ?? null;
	const estado = ORDER_STATES.find((s) => s === url.searchParams.get('estado')) ?? null;
	const [catalog, orders, toValidate] = await Promise.all([
		selected && vista === 'catalogo' ? catalogFor(selected.brandCode) : [],
		vista === 'pedidos' ? listOrders(actor, { state: estado ?? undefined }) : [],
		internal(actor.role) ? listOrders(actor, { state: 'pending_validation' }) : []
	]);
	return {
		title: 'Reposiciones',
		vista,
		restaurants,
		selected,
		catalog,
		orders,
		estado,
		toValidate,
		today: todayDay()
	};
};

const note = z.string().max(500).optional();

async function cartFor(locals: App.Locals, form: FormData) {
	const r = z.string().min(1).max(40).safeParse(form.get('r'));
	if (!r.success) return null;
	const rest = (await orderRestaurants(locals.user!)).find((x) => x.id === r.data);
	if (!rest) return null;
	const catalog = await catalogFor(rest.brandCode);
	const lines = parseCart(form).flatMap((l) => {
		const item = catalog.find((c) => c.id === l.itemId);
		return item
			? [
					{
						itemId: item.id,
						label: item.name,
						unit: item.unit,
						qty: l.qty,
						unitPriceCents: item.priceCents,
						leadDays: item.leadDays
					}
				]
			: [];
	});
	return { restaurant: rest, lines };
}

export const actions: Actions = {
	/** Sin JS: revisa el carrito y devuelve el resumen para confirmar (con JS se confirma en el cliente). */
	revisar: async ({ request, locals }) => {
		const form = await request.formData();
		const cart = await cartFor(locals, form);
		if (!cart) return fail(400, { error: 'Elige un restaurante' });
		if (!cart.lines.length) return fail(400, { error: 'Añade al menos un artículo' });
		const nota = note.safeParse(form.get('nota') ?? undefined);
		return {
			review: {
				restaurantId: cart.restaurant.id,
				restaurantName: cart.restaurant.name,
				lines: cart.lines,
				total: cartTotal(cart.lines),
				leadDays: cartLead(cart.lines),
				nota: nota.success ? (nota.data ?? '') : ''
			}
		};
	},
	pedir: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const r = z.string().min(1).max(40).safeParse(form.get('r'));
		const nota = note.safeParse(form.get('nota') ?? undefined);
		if (!r.success || !nota.success) return fail(400, { error: 'Revisa el pedido' });
		try {
			const placed = await placeOrder(locals.user!, r.data, parseCart(form), nota.data ?? null, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
			return {
				placed: placed.id,
				toast: `Pedido ${placed.id} enviado · ${money(placed.total)} · entrega prevista el ${fmtDay(addDays(todayDay(), placed.leadDays))}`
			};
		} catch (e) {
			if (e instanceof OrderError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
