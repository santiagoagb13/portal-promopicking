import { fail } from '@sveltejs/kit';
import { MILESTONE_KEYS, type MilestoneKey } from '$lib/domain/campaign';
import { settingsInput } from '$lib/schemas/campaign';
import { getSettings, saveSettings, SettingsError } from '$lib/server/services/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	title: 'Ajustes',
	settings: await getSettings()
});

export const actions: Actions = {
	guardar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = settingsInput.safeParse({
			offsets: Object.fromEntries(MILESTONE_KEYS.map((k) => [k, form.get(`offset_${k}`)])),
			otifTarget: form.get('otifTarget'),
			company: {
				name: form.get('companyName') ?? '',
				taxId: form.get('companyTaxId') ?? '',
				address: form.get('companyAddress') ?? '',
				email: form.get('companyEmail') ?? ''
			}
		});
		if (!parsed.success)
			return fail(400, {
				error:
					'Revisa los valores: días entre 0 y 365, OTIF entre 50 y 100 y un correo de contacto válido'
			});
		// En el formulario son «días antes»; se guardan como desplazamientos negativos.
		const milestoneOffsets = Object.fromEntries(
			MILESTONE_KEYS.map((k) => [k, parsed.data.offsets[k] === 0 ? 0 : -parsed.data.offsets[k]])
		) as Record<MilestoneKey, number>;
		try {
			await saveSettings(
				locals.user!,
				{ milestoneOffsets, otifTarget: parsed.data.otifTarget, company: parsed.data.company },
				{ ip: getClientAddress(), userAgent: request.headers.get('user-agent') }
			);
		} catch (e) {
			if (e instanceof SettingsError) return fail(400, { error: e.message });
			throw e;
		}
		return { toast: 'Ajustes guardados' };
	}
};
