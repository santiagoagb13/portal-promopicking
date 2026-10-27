import { error, fail, redirect } from '@sveltejs/kit';
import { FIELD_LABEL } from '$lib/domain/master';
import { applyImport, getImport, MasterError } from '$lib/server/services/master';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const imp = await getImport(params.id);
	if (!imp || (locals.user!.role !== 'admin' && imp.uploadedBy !== locals.user!.id))
		error(404, 'Importación no encontrada');
	return { title: 'Importar maestro', imp, labels: FIELD_LABEL };
};

export const actions: Actions = {
	aplicar: async ({ params, locals, request, getClientAddress }) => {
		try {
			const res = await applyImport(locals.user!, params.id, {
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent')
			});
			redirect(303, `/maestro?importado=${res.added}-${res.changed}-${res.removed}`);
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
