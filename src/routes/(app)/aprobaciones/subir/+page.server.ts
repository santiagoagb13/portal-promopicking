import { error } from '@sveltejs/kit';
import { can } from '$lib/permissions';
import { getSupportForActor } from '$lib/server/services/approvals';
import type { PageServerLoad } from './$types';

/** Subida sin JS (con JS se sube desde el panel lateral de Aprobaciones, en paralelo y directa). */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!can(locals.user!, 'artwork.upload')) error(403, 'No puedes subir artes');
	const id = url.searchParams.get('soporte') ?? '';
	const support = await getSupportForActor(locals.user!, id);
	if (!support) error(404, 'Soporte no encontrado');
	return {
		title: `Subir artes · ${support.name}`,
		support: { id: support.id, name: support.name }
	};
};
