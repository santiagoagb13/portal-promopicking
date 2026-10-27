import { fail } from '@sveltejs/kit';
import { nextStep, SCAN_STEPS } from '$lib/domain/kits';
import { can } from '$lib/permissions';
import { z } from '$lib/schemas/z';
import {
	generateKits,
	KitError,
	kitCampaigns,
	kitSummary,
	listKits,
	registerScan
} from '$lib/server/services/kits';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:kits');
	const actor = locals.user!;
	const campaigns = await kitCampaigns(actor);
	const withKits = campaigns.filter((c) => c.kits > 0);
	const wanted = url.searchParams.get('campana');
	const campaign = campaigns.find((c) => c.id === wanted) ?? withKits[0] ?? null;
	const state = url.searchParams.get('estado');
	const stateN = state !== null && /^[0-4]$/.test(state) ? Number(state) : undefined;
	const [summary, rows] = campaign
		? await Promise.all([kitSummary(actor, campaign.id), listKits(actor, campaign.id, stateN)])
		: [[0, 0, 0, 0, 0], []];
	return {
		title: 'Kits y etiquetas',
		campaigns: can(actor, 'campaign.edit') ? campaigns : withKits,
		campaign,
		summary,
		state: stateN ?? null,
		rows: rows.map((r) => ({ ...r, next: nextStep(r.state) })),
		canGenerate: can(actor, 'campaign.edit'),
		scanSteps: SCAN_STEPS.filter((s) => can(actor, 'kit.scan', { scanStep: s }))
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

export const actions: Actions = {
	generar: async ({ request, locals, getClientAddress }) => {
		const c = z
			.string()
			.min(1)
			.max(40)
			.safeParse((await request.formData()).get('campana'));
		if (!c.success) return fail(400);
		try {
			const n = await generateKits(locals.user!, c.data, meta(request, getClientAddress()));
			return { toast: n ? `${n} kits generados` : 'Ya estaban todos generados' };
		} catch (e) {
			if (e instanceof KitError) return fail(400, { error: e.message });
			throw e;
		}
	},
	/** Paso siguiente desde la lista (sin lector): queda como evento «web». */
	registrar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const parsed = z
			.object({ kit: z.string().min(1).max(40), paso: z.enum(SCAN_STEPS as [string, ...string[]]) })
			.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400);
		try {
			const r = await registerScan(
				locals.user!,
				{
					kitId: parsed.data.kit,
					step: parsed.data.paso as (typeof SCAN_STEPS)[number],
					source: 'web'
				},
				meta(request, getClientAddress())
			);
			return { toast: r.already ? 'Ya estaba registrado' : `${r.label} registrada` };
		} catch (e) {
			if (e instanceof KitError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
