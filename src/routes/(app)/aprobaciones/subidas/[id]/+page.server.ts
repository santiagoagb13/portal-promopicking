import { error, fail, redirect } from '@sveltejs/kit';
import {
	ApprovalError,
	discardUpload,
	getUploadReview,
	publishUpload
} from '$lib/server/services/approvals';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const review = await getUploadReview(locals.user!, params.id);
	if (!review) error(404, 'Subida no encontrada');
	return { title: 'Revisar subida', ...review };
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

export const actions: Actions = {
	publicar: async ({ request, locals, params, getClientAddress }) => {
		const form = await request.formData();
		const codes: Record<string, string> = {};
		for (const [k, v] of form)
			if (k.startsWith('codigo_') && typeof v === 'string') codes[k.slice(7)] = v;
		let supportId: string;
		try {
			const review = await getUploadReview(locals.user!, params.id);
			if (!review) return fail(404);
			supportId = review.support.id;
			await publishUpload(locals.user!, params.id, codes, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof ApprovalError) return fail(400, { error: e.message, codes });
			throw e;
		}
		redirect(303, `/aprobaciones?soporte=${supportId}&vf=pendientes`);
	},
	descartar: async ({ locals, params }) => {
		const review = await getUploadReview(locals.user!, params.id);
		if (!review) return fail(404);
		try {
			await discardUpload(locals.user!, params.id);
		} catch (e) {
			if (e instanceof ApprovalError) return fail(400, { error: e.message });
			throw e;
		}
		redirect(303, `/aprobaciones?soporte=${review.support.id}`);
	}
};
