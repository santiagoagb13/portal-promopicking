import { fail } from '@sveltejs/kit';
import { parseKitCode, SCAN_STEPS, type ScanStep } from '$lib/domain/kits';
import { can } from '$lib/permissions';
import { KitError, registerScan } from '$lib/server/services/kits';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const steps = SCAN_STEPS.filter((s) => can(locals.user!, 'kit.scan', { scanStep: s }));
	const wanted = url.searchParams.get('paso') as ScanStep | null;
	return { title: 'Escaneo', steps, step: wanted && steps.includes(wanted) ? wanted : steps[0]! };
};

export const actions: Actions = {
	/** Sin JS: el código y el paso llegan en el formulario. */
	escanear: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const code = parseKitCode(String(form.get('codigo') ?? ''));
		const step = String(form.get('paso') ?? '') as ScanStep;
		if (!code) return fail(400, { error: 'No es un código de kit' });
		if (!SCAN_STEPS.includes(step)) return fail(400, { error: 'Elige el paso' });
		try {
			const r = await registerScan(
				locals.user!,
				{ kitId: code.kitId, step, source: 'scanner' },
				{ ip: getClientAddress(), userAgent: request.headers.get('user-agent') }
			);
			return { result: r };
		} catch (e) {
			if (e instanceof KitError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
