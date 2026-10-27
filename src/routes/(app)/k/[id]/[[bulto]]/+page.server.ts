import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Destino del QR de la etiqueta: el gerente va a su recepción; el resto, a la trazabilidad del kit. */
export const load: PageServerLoad = ({ locals, params }) => {
	if (locals.user?.role === 'manager') redirect(303, `/kits/recepcion#${params.id}`);
	redirect(303, `/kits/${params.id}`);
};
