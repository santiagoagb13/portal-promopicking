import { fail } from '@sveltejs/kit';
import { INCIDENT_KINDS } from '$lib/domain/kits';
import { z } from '$lib/schemas/z';
import {
	KitError,
	openIncident,
	receiveKit,
	receptionList,
	storePhoto
} from '$lib/server/services/kits';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:recepcion');
	return {
		title: 'Recepción de kits',
		...(await receptionList(locals.user!)),
		kinds: INCIDENT_KINDS
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});
const kitId = z.string().min(1).max(40);

/** Sin JS: los formularios llegan aquí. Con JS se usa /api/kits/eventos (y la cola sin conexión). */
export const actions: Actions = {
	recibir: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = kitId.safeParse(form.get('kit'));
		if (!id.success) return fail(400);
		const parcels = form
			.getAll('bulto')
			.map(Number)
			.filter((n) => Number.isInteger(n) && n > 0);
		try {
			await receiveKit(locals.user!, id.data, {
				parcelsChecked: parcels,
				...meta(request, getClientAddress())
			});
		} catch (e) {
			if (e instanceof KitError) return fail(400, { kit: id.data, error: e.message });
			throw e;
		}
		return { toast: 'Recepción confirmada' };
	},
	incidencia: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({ kit: kitId, tipo: z.enum(INCIDENT_KINDS), texto: z.string().max(2000) })
			.safeParse(Object.fromEntries(form));
		if (!parsed.success)
			return fail(400, {
				kit: String(form.get('kit')),
				error: 'Elige el tipo y describe la incidencia'
			});
		const foto = form.get('foto');
		try {
			const photoKey =
				foto instanceof File && foto.size > 0
					? await storePhoto(parsed.data.kit, new Uint8Array(await foto.arrayBuffer()))
					: null;
			const r = await openIncident(locals.user!, parsed.data.kit, {
				kind: parsed.data.tipo,
				text: parsed.data.texto,
				photoKey,
				...meta(request, getClientAddress())
			});
			return { toast: `Incidencia ${r.ticketId} abierta` };
		} catch (e) {
			if (e instanceof KitError) return fail(400, { kit: parsed.data.kit, error: e.message });
			throw e;
		}
	}
};
