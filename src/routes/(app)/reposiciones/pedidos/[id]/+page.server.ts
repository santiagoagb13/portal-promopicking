import { error, fail } from '@sveltejs/kit';
import { z } from '$lib/schemas/z';
import {
	advanceOrder,
	cancelOrder,
	getOrder,
	OrderError,
	validateOrder
} from '$lib/server/services/orders';
import { ORDER_STATE_LABEL } from '$lib/domain/orders';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const order = await getOrder(locals.user!, params.id);
	if (!order) error(404, 'Pedido no encontrado');
	const actor = locals.user!;
	const internal = actor.role === 'admin' || actor.role === 'ops';
	return {
		title: `Pedido ${order.id}`,
		order,
		can: {
			validate: internal && order.state === 'pending_validation',
			advance: internal && (order.state === 'preparing' || order.state === 'shipping'),
			cancel: order.state === 'preparing' && (internal || order.placedById === actor.id)
		}
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

async function run(fn: () => Promise<unknown>, ok: string) {
	try {
		await fn();
		return { toast: ok };
	} catch (e) {
		if (e instanceof OrderError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	validar: ({ request, locals, params, getClientAddress }) =>
		run(
			() => validateOrder(locals.user!, params.id, true, null, meta(request, getClientAddress())),
			'Pedido validado: pasa a preparación'
		),
	rechazar: async ({ request, locals, params, getClientAddress }) => {
		const motivo = z
			.string()
			.trim()
			.min(3)
			.max(500)
			.safeParse((await request.formData()).get('motivo'));
		if (!motivo.success) return fail(400, { error: 'Explica por qué se rechaza' });
		return run(
			() =>
				validateOrder(
					locals.user!,
					params.id,
					false,
					motivo.data,
					meta(request, getClientAddress())
				),
			'Pedido rechazado'
		);
	},
	avanzar: async ({ request, locals, params, getClientAddress }) => {
		try {
			const next = await advanceOrder(locals.user!, params.id, meta(request, getClientAddress()));
			return { toast: `Pedido ${ORDER_STATE_LABEL[next].toLowerCase()}` };
		} catch (e) {
			if (e instanceof OrderError) return fail(400, { error: e.message });
			throw e;
		}
	},
	cancelar: ({ request, locals, params, getClientAddress }) =>
		run(
			() => cancelOrder(locals.user!, params.id, meta(request, getClientAddress())),
			'Pedido cancelado'
		)
};
