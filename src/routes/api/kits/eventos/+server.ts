import { json } from '@sveltejs/kit';
import { SCAN_STEPS, type ScanStep } from '$lib/domain/kits';
import { z } from '$lib/schemas/z';
import {
	KitError,
	openIncident,
	receiveKit,
	registerScan,
	storePhoto
} from '$lib/server/services/kits';
import type { RequestHandler } from './$types';

const event = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('scan'),
		clientId: z.string().uuid(),
		at: z.string(),
		kitId: z.string().max(40),
		step: z.enum(SCAN_STEPS as [ScanStep, ...ScanStep[]]),
		source: z.enum(['scanner', 'mobile', 'web']).optional()
	}),
	z.object({
		type: z.literal('receive'),
		clientId: z.string().uuid(),
		at: z.string(),
		kitId: z.string().max(40),
		parcels: z.array(z.number().int().min(1).max(99))
	}),
	z.object({
		type: z.literal('incident'),
		clientId: z.string().uuid(),
		at: z.string(),
		kitId: z.string().max(40),
		kind: z.string().min(2).max(60),
		text: z.string().max(2000)
	})
]);

/**
 * Eventos de kit desde el lector, la recepción y la cola sin conexión (multipart: `evento` en JSON
 * y `foto` opcional). La sesión la exige hooks.server.ts y SvelteKit comprueba el origen.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const form = await request.formData();
	const parsed = event.safeParse(JSON.parse(String(form.get('evento') ?? '{}')));
	if (!parsed.success) return json({ error: 'Evento no válido' }, { status: 400 });
	const e = parsed.data;
	const meta = { ip: getClientAddress(), userAgent: request.headers.get('user-agent') };
	const at = new Date(e.at);
	try {
		if (e.type === 'scan')
			return json(
				await registerScan(
					locals.user!,
					{ kitId: e.kitId, step: e.step, at, clientId: e.clientId, source: e.source ?? 'scanner' },
					meta
				)
			);
		const photo = form.get('foto');
		const photoKey =
			photo instanceof File && photo.size > 0
				? await storePhoto(e.kitId, new Uint8Array(await photo.arrayBuffer()))
				: null;
		if (e.type === 'receive')
			return json(
				await receiveKit(locals.user!, e.kitId, {
					parcelsChecked: e.parcels,
					at,
					clientId: e.clientId,
					photoKey,
					...meta
				})
			);
		return json(
			await openIncident(locals.user!, e.kitId, {
				kind: e.kind,
				text: e.text,
				photoKey,
				at,
				clientId: e.clientId,
				...meta
			})
		);
	} catch (err) {
		if (err instanceof KitError) return json({ error: err.message }, { status: 422 });
		throw err;
	}
};
