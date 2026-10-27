import { error, fail } from '@sveltejs/kit';
import { z } from '$lib/schemas/z';
import {
	qrLanding,
	QrError,
	qrReorder,
	qrReport,
	qrRetire,
	REPORT_REASONS
} from '$lib/server/services/qr';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const q = await qrLanding(params.codigo);
	if (!q) error(404, 'Código no reconocido');
	return { title: q.support, q, reasons: REPORT_REASONS };
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

async function run<T>(fn: () => Promise<T>) {
	try {
		return { ok: true as const, value: await fn() };
	} catch (e) {
		if (e instanceof QrError)
			return { ok: false as const, failure: fail(400, { error: e.message }) };
		throw e;
	}
}

export const actions: Actions = {
	reponer: async ({ request, params, getClientAddress }) => {
		const qty = z.coerce
			.number()
			.int()
			.min(1)
			.max(50)
			.safeParse((await request.formData()).get('cantidad'));
		if (!qty.success) return fail(400, { error: 'Pide entre 1 y 50 unidades' });
		const r = await run(() =>
			qrReorder(params.codigo, qty.data, meta(request, getClientAddress()))
		);
		return r.ok ? { done: 'reponer', ref: r.value } : r.failure;
	},
	error: async ({ request, params, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({ motivo: z.enum(REPORT_REASONS), texto: z.string().max(1000) })
			.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { error: 'Elige el motivo' });
		const r = await run(() =>
			qrReport(
				params.codigo,
				parsed.data.motivo,
				parsed.data.texto,
				meta(request, getClientAddress())
			)
		);
		return r.ok ? { done: 'error', ref: r.value } : r.failure;
	},
	retirar: async ({ request, params, getClientAddress }) => {
		const r = await run(() => qrRetire(params.codigo, meta(request, getClientAddress())));
		return r.ok ? { done: 'retirar', ref: null } : r.failure;
	}
};
