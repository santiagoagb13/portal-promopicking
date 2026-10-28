import { fail } from '@sveltejs/kit';
import {
	INCIDENT_KINDS,
	QUERY_KINDS,
	SEVERITIES,
	TICKET_TYPES,
	type Severity,
	type TicketType
} from '$lib/domain/tickets';
import { z } from '$lib/schemas/z';
import {
	assignTicket,
	closeTicket,
	createTicket,
	getTicket,
	listTickets,
	reopenTicket,
	replyTicket,
	setSeverity,
	storeTicketPhoto,
	TicketError,
	ticketOptions
} from '$lib/server/services/tickets';
import type { Actions, PageServerLoad } from './$types';

const pick = <T extends string>(list: readonly T[], v: string | null) =>
	list.find((x) => x === v) ?? undefined;

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = locals.user!;
	const q = url.searchParams;
	const filters = {
		open: q.get('todas') !== '1',
		type: pick<TicketType>(TICKET_TYPES, q.get('tipo')),
		campaignId: q.get('campana') || undefined,
		restaurantId: q.get('restaurante') || undefined,
		severity: pick<Severity>(SEVERITIES, q.get('severidad'))
	};
	const abrir = q.get('abrir');
	const [tickets, options, ticket] = await Promise.all([
		listTickets(actor, filters),
		ticketOptions(actor),
		abrir ? getTicket(actor, abrir) : null
	]);
	return {
		title: 'Soporte e incidencias',
		tickets,
		filters,
		options,
		ticket,
		openNew: q.get('nuevo') === '1',
		prefill: {
			campaignId: q.get('campana') ?? '',
			restaurantId:
				q.get('restaurante') ?? (actor.restaurants.length === 1 ? actor.restaurants[0]!.id : ''),
			orderId: q.get('pedido') ?? '',
			kind: q.get('motivo') ?? ''
		},
		kinds: { incident: INCIDENT_KINDS, query: QUERY_KINDS }
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

async function photoFrom(form: FormData, folder: string) {
	const f = form.get('foto');
	if (!(f instanceof File) || !f.size) return null;
	return storeTicketPhoto(folder, new Uint8Array(await f.arrayBuffer()));
}

const optional = z
	.string()
	.max(80)
	.optional()
	.transform((v) => v || null);

/** Ejecuta la acción y traduce los errores de negocio a un 400 con el mensaje. */
async function run<T>(id: string | null, fn: () => Promise<T>, toast: string) {
	try {
		await fn();
		return { toast };
	} catch (e) {
		if (e instanceof TicketError) return fail(400, { ticket: id, error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	nuevo: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const kinds = [...INCIDENT_KINDS, ...QUERY_KINDS] as string[];
		const parsed = z
			.object({
				motivo: z.string().refine((v) => kinds.includes(v), 'Elige el motivo'),
				campana: optional,
				restaurante: optional,
				pedido: optional,
				texto: z.string().trim().min(3, 'Describe la consulta o la incidencia').max(4000)
			})
			.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));
		if (!parsed.success)
			return fail(400, {
				nuevo: true,
				error: parsed.error.issues[0]?.message ?? 'Revisa el formulario'
			});
		const p = parsed.data;
		try {
			const photoKey = await photoFrom(form, 'nuevos');
			const id = await createTicket(
				locals.user!,
				{
					type: (INCIDENT_KINDS as readonly string[]).includes(p.motivo) ? 'incident' : 'query',
					kind: p.motivo,
					campaignId: p.campana,
					restaurantId: p.restaurante,
					orderId: p.pedido,
					text: p.texto,
					photoKey
				},
				meta(request, getClientAddress())
			);
			return { created: id, toast: `${id} registrado. Promopicking lo verá en Soporte.` };
		} catch (e) {
			if (e instanceof TicketError) return fail(400, { nuevo: true, error: e.message });
			throw e;
		}
	},
	responder: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = String(form.get('ticket') ?? '');
		const text = String(form.get('texto') ?? '').slice(0, 4000);
		return run(
			id,
			async () =>
				replyTicket(
					locals.user!,
					id,
					text,
					await photoFrom(form, id),
					meta(request, getClientAddress())
				),
			'Respuesta enviada'
		);
	},
	asignar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = String(form.get('ticket') ?? '');
		const to = String(form.get('responsable') ?? '') || null;
		return run(
			id,
			() => assignTicket(locals.user!, id, to, meta(request, getClientAddress())),
			'Responsable cambiado'
		);
	},
	severidad: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = String(form.get('ticket') ?? '');
		const sev = pick<Severity>(SEVERITIES, String(form.get('severidad')));
		if (!sev) return fail(400, { ticket: id, error: 'Severidad no válida' });
		return run(
			id,
			() => setSeverity(locals.user!, id, sev, meta(request, getClientAddress())),
			'Severidad cambiada'
		);
	},
	cerrar: async ({ request, locals, getClientAddress }) => {
		const id = String((await request.formData()).get('ticket') ?? '');
		return run(
			id,
			() => closeTicket(locals.user!, id, meta(request, getClientAddress())),
			`${id} cerrada`
		);
	},
	reabrir: async ({ request, locals, getClientAddress }) => {
		const id = String((await request.formData()).get('ticket') ?? '');
		return run(
			id,
			() => reopenTicket(locals.user!, id, meta(request, getClientAddress())),
			`${id} reabierta`
		);
	}
};
