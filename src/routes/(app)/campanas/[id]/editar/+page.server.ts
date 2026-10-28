import { error, fail, redirect } from '@sveltejs/kit';
import { todayDay } from '$lib/domain/dates';
import { can } from '$lib/permissions';
import { campaignInput } from '$lib/schemas/campaign';
import { config } from '$lib/server/config';
import {
	CampaignError,
	getCampaignDetail,
	ownersByBrand,
	updateCampaign
} from '$lib/server/services/campaigns';
import type { Actions, PageServerLoad } from './$types';

/** Edición de campaña sin JS. Con JS se edita en el panel lateral del detalle. */
export const load: PageServerLoad = async ({ locals, params }) => {
	const actor = locals.user!;
	if (!can(actor, 'campaign.edit')) error(403, 'No puedes editar campañas');
	const detail = await getCampaignDetail(actor, params.id, todayDay(config.referenceDate));
	if (!detail || detail.campaign.archived) error(404, 'Campaña no encontrada');
	const c = detail.campaign;
	return {
		title: `Editar ${c.name}`,
		campaign: c,
		owners: (await ownersByBrand()).filter((o) => o.brandCode === c.brandCode)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, getClientAddress }) => {
		const form = Object.fromEntries(await request.formData()) as Record<string, string>;
		const parsed = campaignInput.safeParse(form);
		if (!parsed.success)
			return fail(400, { edit: { error: parsed.error.issues[0]?.message, values: form } });
		const { brandCode: _b, ...input } = parsed.data;
		try {
			await updateCampaign(locals.user!, params.id, input, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
		} catch (e) {
			if (e instanceof CampaignError)
				return fail(400, { edit: { error: e.message, values: form } });
			throw e;
		}
		redirect(303, `/campanas/${params.id}`);
	}
};
