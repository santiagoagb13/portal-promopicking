import { error, fail, redirect } from '@sveltejs/kit';
import { z } from '$lib/schemas/z';
import { todayDay } from '$lib/domain/dates';
import { can } from '$lib/permissions';
import {
	campaignInput,
	duplicateInput,
	milestonesInput,
	supportInput
} from '$lib/schemas/campaign';
import { config } from '$lib/server/config';
import {
	CampaignError,
	deleteSupport,
	duplicateCampaign,
	getCampaignDetail,
	ownersByBrand,
	saveSupport,
	setArchived,
	updateCampaign,
	updateMilestones
} from '$lib/server/services/campaigns';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
	depends('app:campana');
	const actor = locals.user!;
	const today = todayDay(config.referenceDate);
	// Fuera del ámbito es «no encontrada»: no se revela que existe.
	const detail = await getCampaignDetail(actor, params.id, today);
	if (!detail || (detail.campaign.archived && !can(actor, 'campaign.edit')))
		error(404, 'Campaña no encontrada');
	const canEdit = can(actor, 'campaign.edit');
	return {
		title: detail.campaign.name,
		today,
		...detail,
		canEdit,
		canCreate: can(actor, 'campaign.create'),
		canSeeApprovals: can(actor, 'artwork.view', { brandCode: detail.campaign.brandCode }),
		owners: canEdit
			? (await ownersByBrand()).filter((o) => o.brandCode === detail.campaign.brandCode)
			: [],
		open: url.searchParams.get('abrir'),
		created: url.searchParams.has('creada')
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

/** Ejecuta una mutación y convierte los errores de negocio en respuestas 400 con su mensaje. */
async function run<T>(key: string, fn: () => Promise<T>) {
	try {
		return { ok: true as const, value: await fn() };
	} catch (e) {
		if (e instanceof CampaignError)
			return { ok: false as const, failure: fail(400, { [key]: { error: e.message } }) };
		throw e;
	}
}

export const actions: Actions = {
	editar: async ({ request, locals, params, getClientAddress }) => {
		const form = Object.fromEntries(await request.formData());
		const parsed = campaignInput.safeParse(form);
		if (!parsed.success)
			return fail(400, { edit: { error: parsed.error.issues[0]?.message, values: form } });
		const { brandCode: _b, ...input } = parsed.data;
		const r = await run('edit', () =>
			updateCampaign(locals.user!, params.id, input, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Campaña guardada' } : r.failure;
	},
	hitos: async ({ request, locals, params, getClientAddress }) => {
		const parsed = milestonesInput.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { milestones: { error: 'Revisa las fechas' } });
		const r = await run('milestones', () =>
			updateMilestones(locals.user!, params.id, parsed.data, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Calendario guardado' } : r.failure;
	},
	duplicar: async ({ request, locals, params, getClientAddress }) => {
		const parsed = duplicateInput.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success)
			return fail(400, { duplicate: { error: parsed.error.issues[0]?.message } });
		const r = await run('duplicate', () =>
			duplicateCampaign(locals.user!, params.id, parsed.data, meta(request, getClientAddress()))
		);
		if (!r.ok) return r.failure;
		redirect(303, `/campanas/${r.value}?creada=1`);
	},
	archivar: async ({ request, locals, params, getClientAddress }) => {
		const form = await request.formData();
		const detail = await getCampaignDetail(locals.user!, params.id, todayDay(config.referenceDate));
		if (!detail) return fail(404);
		// «Escribe el nombre»: también se comprueba aquí.
		if (String(form.get('confirmacion') ?? '').trim() !== detail.campaign.name)
			return fail(400, { archive: { error: 'Escribe el nombre exacto de la campaña' } });
		const r = await run('archive', () =>
			setArchived(locals.user!, params.id, true, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Campaña archivada' } : r.failure;
	},
	restaurar: async ({ request, locals, params, getClientAddress }) => {
		const r = await run('archive', () =>
			setArchived(locals.user!, params.id, false, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Campaña restaurada' } : r.failure;
	},
	soporte: async ({ request, locals, params, getClientAddress }) => {
		const form = Object.fromEntries(await request.formData());
		const parsed = supportInput.safeParse(form);
		const supportId = typeof form.id === 'string' && form.id ? form.id : null;
		if (!parsed.success)
			return fail(400, {
				support: { id: supportId, error: parsed.error.issues[0]?.message, values: form }
			});
		const r = await run('support', () =>
			saveSupport(
				locals.user!,
				params.id,
				parsed.data,
				supportId,
				meta(request, getClientAddress())
			)
		);
		return r.ok ? { toast: supportId ? 'Soporte guardado' : 'Soporte añadido' } : r.failure;
	},
	borrarSoporte: async ({ request, locals, params, getClientAddress }) => {
		const id = z
			.string()
			.min(1)
			.max(80)
			.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400);
		const r = await run('support', () =>
			deleteSupport(locals.user!, params.id, id.data, meta(request, getClientAddress()))
		);
		return r.ok ? { toast: 'Soporte eliminado' } : r.failure;
	}
};
