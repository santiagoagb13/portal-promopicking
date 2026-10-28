import type { PageLoad } from './$types';

/**
 * Los formularios de calendario y de soporte (y su panel lateral) no van en el JS de la página: se traen aquí solo si
 * la URL los abre (enlace sin JS o error de validación), y con JS al pulsar el botón.
 */
export const load: PageLoad = async ({ data, url }) => {
	const open = url.searchParams.get('abrir') ?? '';
	const [Drawer, MilestonesForm, SupportForm] = await Promise.all([
		open === 'hitos' || open.startsWith('soporte-')
			? import('$components/ui/Drawer.svelte').then((m) => m.default)
			: null,
		open === 'hitos'
			? import('$components/domain/campaign/MilestonesForm.svelte').then((m) => m.default)
			: null,
		open.startsWith('soporte-')
			? import('$components/domain/campaign/SupportForm.svelte').then((m) => m.default)
			: null
	]);
	return { ...data, Drawer, MilestonesForm, SupportForm };
};
