import { fail, redirect } from '@sveltejs/kit';
import { can } from '$lib/permissions';
import { z } from '$lib/schemas/z';
import {
	addComment,
	ApprovalError,
	approveAll,
	decide,
	getSupportForActor,
	getVersionView,
	listApprovalSupports,
	listVersions,
	prepareUpload,
	registerUpload,
	uploadDirect
} from '$lib/server/services/approvals';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:aprobaciones');
	const actor = locals.user!;
	const sp = url.searchParams;
	const supportId = sp.get('soporte');
	const versionId = sp.get('version');
	const [supports, support] = await Promise.all([
		listApprovalSupports(actor),
		supportId ? getSupportForActor(actor, supportId) : null
	]);
	const versions = support ? await listVersions(support.id) : [];
	const view =
		support && versionId && versions.some((v) => v.id === versionId)
			? await getVersionView(actor, support.id, versionId)
			: null;
	return {
		title: 'Aprobación de artes',
		supports,
		support,
		versions,
		view,
		supportFilter: sp.get('filtro') === 'todas' ? 'todas' : 'pendientes',
		versionFilter: sp.get('vf') === 'pendientes' ? 'pendientes' : 'todas',
		page: Math.max(1, Number(sp.get('pagina')) || 1),
		compare: sp.has('comparar'),
		step: view ? 'visor' : support ? 'versiones' : 'soportes',
		canUpload: can(actor, 'artwork.upload'),
		canDecide: !!support && can(actor, 'artwork.decide', { brandCode: support.brandCode })
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});
const id = z.string().min(1).max(80);

async function guard<T>(key: string, fn: () => Promise<T>) {
	try {
		return { ok: true as const, value: await fn() };
	} catch (e) {
		if (e instanceof ApprovalError)
			return { ok: false as const, failure: fail(400, { [key]: { error: e.message } }) };
		throw e;
	}
}

export const actions: Actions = {
	aprobar: async ({ request, locals, getClientAddress }) => {
		const v = id.safeParse((await request.formData()).get('version'));
		if (!v.success) return fail(400);
		const r = await guard('decision', () =>
			decide(locals.user!, v.data, 'approve', meta(request, getClientAddress()))
		);
		return r.ok ? { approved: r.value.code, undo: v.data } : r.failure;
	},
	cambios: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const v = id.safeParse(form.get('version'));
		if (!v.success) return fail(400);
		const comment = String(form.get('comentario') ?? '');
		const r = await guard('decision', () =>
			decide(locals.user!, v.data, 'changes', { comment, ...meta(request, getClientAddress()) })
		);
		return r.ok ? { toast: 'Cambios pedidos' } : r.failure;
	},
	reabrir: async ({ request, locals, getClientAddress }) => {
		const v = id.safeParse((await request.formData()).get('version'));
		if (!v.success) return fail(400);
		const r = await guard('decision', () =>
			decide(locals.user!, v.data, 'reopen', meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Versión reabierta' } : r.failure;
	},
	deshacer: async ({ request, locals, getClientAddress }) => {
		const v = id.safeParse((await request.formData()).get('version'));
		if (!v.success) return fail(400);
		const r = await guard('decision', () =>
			decide(locals.user!, v.data, 'undo', meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Aprobación deshecha' } : r.failure;
	},
	aprobarTodas: async ({ request, locals, getClientAddress }) => {
		const s = id.safeParse((await request.formData()).get('soporte'));
		if (!s.success) return fail(400);
		const r = await guard('decision', () =>
			approveAll(locals.user!, s.data, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: `${r.value} versiones aprobadas` } : r.failure;
	},
	comentar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({
				version: id,
				texto: z.string().min(1).max(2000),
				pagina: z.coerce.number().int().min(1).max(99).optional(),
				x: z.coerce.number().min(0).max(1).optional(),
				y: z.coerce.number().min(0).max(1).optional()
			})
			.safeParse({
				version: form.get('version'),
				texto: form.get('texto'),
				pagina: form.get('pagina') || undefined,
				x: form.get('x') || undefined,
				y: form.get('y') || undefined
			});
		if (!parsed.success) return fail(400, { comment: { error: 'Escribe el comentario' } });
		const { version, texto, pagina, x, y } = parsed.data;
		const r = await guard('comment', () =>
			addComment(locals.user!, version, {
				text: texto,
				page: pagina,
				x,
				y,
				...meta(request, getClientAddress())
			})
		);
		return r.ok ? { commented: true } : r.failure;
	},
	/** Subida con JS, paso 1: el navegador recibe una URL de subida directa por fichero. */
	prepararSubida: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({
				soporte: id,
				nombres: z.array(z.string().min(1).max(200)).min(1),
				tamanos: z.array(z.coerce.number().int()).min(1)
			})
			.safeParse({
				soporte: form.get('soporte'),
				nombres: form.getAll('nombre'),
				tamanos: form.getAll('tamano')
			});
		if (!parsed.success || parsed.data.nombres.length !== parsed.data.tamanos.length)
			return fail(400, { upload: { error: 'Elige ficheros PDF' } });
		const files = parsed.data.nombres.map((name, i) => ({ name, size: parsed.data.tamanos[i]! }));
		const r = await guard('upload', () =>
			prepareUpload(locals.user!, parsed.data.soporte, files, meta(request, getClientAddress()))
		);
		return r.ok ? { prepared: r.value } : r.failure;
	},
	/** Subida con JS, paso 2: ficheros ya en el almacenamiento; se comprueban y se pasa a revisar. */
	registrarSubida: async ({ request, locals }) => {
		const u = id.safeParse((await request.formData()).get('subida'));
		if (!u.success) return fail(400);
		const r = await guard('upload', () => registerUpload(locals.user!, u.data));
		if (!r.ok) return r.failure;
		redirect(303, `/aprobaciones/subidas/${u.data}`);
	},
	/** Subida sin JS: los ficheros vienen en el formulario. */
	subir: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const s = id.safeParse(form.get('soporte'));
		const files = form.getAll('ficheros').filter((f): f is File => f instanceof File && f.size > 0);
		if (!s.success || !files.length) return fail(400, { upload: { error: 'Elige ficheros PDF' } });
		const r = await guard('upload', () =>
			uploadDirect(locals.user!, s.data, files, meta(request, getClientAddress()))
		);
		if (!r.ok) return r.failure;
		redirect(303, `/aprobaciones/subidas/${r.value}`);
	}
};
