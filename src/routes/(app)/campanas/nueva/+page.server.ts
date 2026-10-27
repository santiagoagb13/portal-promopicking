import { fail, redirect } from '@sveltejs/kit';
import { campaignInput } from '$lib/schemas/campaign';
import {
	brandsFor,
	CampaignError,
	createCampaign,
	ownersByBrand
} from '$lib/server/services/campaigns';
import type { Actions, PageServerLoad } from './$types';

/** Alta de campaña. Con JS se usa desde el panel lateral del panel de campañas; sin JS, como página. */
export const load: PageServerLoad = async ({ locals }) => {
	const brands = await brandsFor(locals.user!);
	return {
		title: 'Nueva campaña',
		brands: brands.map((b) => ({
			code: b.code,
			label: b.name.split(' ')[0] ?? b.short,
			restaurantCount: b.restaurantCount
		})),
		owners: await ownersByBrand()
	};
};

export const actions: Actions = {
	crear: async ({ request, locals, getClientAddress }) => {
		const form = Object.fromEntries(await request.formData()) as Record<string, string>;
		const parsed = campaignInput.safeParse(form);
		if (!parsed.success)
			return fail(400, {
				create: { error: parsed.error.issues[0]?.message ?? 'Revisa los datos', values: form }
			});
		let id: string;
		try {
			id = await createCampaign(locals.user!, parsed.data, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
		} catch (e) {
			if (e instanceof CampaignError)
				return fail(400, { create: { error: e.message, values: form } });
			throw e;
		}
		redirect(303, `/campanas/${id}?creada=1`);
	}
};
