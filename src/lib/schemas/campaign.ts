import { z } from './z';
import { LAST_STAGE, MILESTONE_KEYS } from '$lib/domain/campaign';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');
const text = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => v || null);
/** Casilla de formulario: sin marcar, la clave ni siquiera llega. */
const checkbox = z
	.string()
	.optional()
	.transform((v) => v === 'on' || v === 'true');
const int = (min: number, max: number) => z.coerce.number().int('Número entero').min(min).max(max);

export const campaignInput = z.object({
	brandCode: z.string().trim().min(1, 'Elige una marca'),
	name: z.string().trim().min(2, 'Escribe el nombre').max(120),
	inRestaurantOn: day,
	restaurantCount: int(1, 2000),
	planned: checkbox,
	materials: text(400),
	notes: text(600),
	ownerUserId: text(80)
});
export type CampaignInput = z.infer<typeof campaignInput>;

export const duplicateInput = z.object({
	name: z.string().trim().min(2, 'Escribe el nombre').max(120),
	inRestaurantOn: day
});

export const supportInput = z.object({
	name: z.string().trim().min(2, 'Escribe el nombre').max(160),
	versionsPlanned: int(0, 5000),
	runQty: int(0, 10_000_000),
	perKitQty: z
		.union([z.literal(''), z.coerce.number().int().min(1).max(100_000)])
		.optional()
		.transform((v) => (v === '' || v === undefined ? null : v)),
	packaging: text(160),
	responsible: text(160),
	stage: int(0, LAST_STAGE),
	notes: text(400)
});
export type SupportInput = z.infer<typeof supportInput>;

export const milestonesInput = z.object(
	Object.fromEntries(MILESTONE_KEYS.map((k) => [k, day])) as Record<
		(typeof MILESTONE_KEYS)[number],
		typeof day
	>
);

export const settingsInput = z.object({
	offsets: z.object(
		Object.fromEntries(
			MILESTONE_KEYS.map((k) => [k, z.coerce.number().int().min(0).max(365)])
		) as Record<(typeof MILESTONE_KEYS)[number], z.ZodNumber>
	),
	otifTarget: z.coerce.number().min(50).max(100)
});
