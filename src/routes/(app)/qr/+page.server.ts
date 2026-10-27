import { fail } from '@sveltejs/kit';
import { can } from '$lib/permissions';
import { z } from '$lib/schemas/z';
import { generateQr, QrError, qrSupports } from '$lib/server/services/qr';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	title: 'QR de versión',
	supports: await qrSupports(locals.user!),
	canGenerate: can(locals.user!, 'artwork.upload')
});

export const actions: Actions = {
	generar: async ({ request, locals, getClientAddress }) => {
		const id = z
			.string()
			.min(1)
			.max(80)
			.safeParse((await request.formData()).get('soporte'));
		if (!id.success) return fail(400);
		try {
			const n = await generateQr(locals.user!, id.data, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
			return { toast: n ? `${n} códigos generados` : 'Ya estaban todos generados' };
		} catch (e) {
			if (e instanceof QrError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
