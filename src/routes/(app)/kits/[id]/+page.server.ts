import { error } from '@sveltejs/kit';
import { nextStep } from '$lib/domain/kits';
import { can } from '$lib/permissions';
import { fileStorage } from '$lib/server/storage';
import { getKit } from '$lib/server/services/kits';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('app:kit');
	const actor = locals.user!;
	const kit = await getKit(actor, params.id);
	if (!kit) error(404, 'Kit no encontrado');
	const storage = fileStorage();
	const events = await Promise.all(
		kit.events.map(async (e) => ({
			...e,
			photoUrl: e.photoKey ? await storage.readUrl(e.photoKey) : null
		}))
	);
	const next = nextStep(kit.state);
	return {
		title: kit.id,
		kit: { ...kit, events },
		next,
		canScan: !!next && can(actor, 'kit.scan', { scanStep: next }),
		canReceive:
			kit.state >= 1 &&
			kit.state <= 3 &&
			can(actor, 'kit.receive', { restaurantId: kit.restaurantId })
	};
};
