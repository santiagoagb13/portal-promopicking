import { error } from '@sveltejs/kit';
import { todayDay } from '$lib/domain/dates';
import { config } from '$lib/server/config';
import { getCampaignDetail } from '$lib/server/services/campaigns';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const today = todayDay(config.referenceDate);
	// Fuera del ámbito es «no encontrada»: no se revela que existe.
	const detail = await getCampaignDetail(locals.user!, params.id, today);
	if (!detail) error(404, 'Campaña no encontrada');
	return { title: detail.campaign.name, today, ...detail };
};
