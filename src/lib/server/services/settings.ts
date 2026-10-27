import { MILESTONE_OFFSETS, offsetsProblem, type MilestoneKey } from '$lib/domain/campaign';
import { can, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { db, tables } from '../db';

const { settings } = tables;

export type PortalSettings = {
	/** Días antes de la fecha en restaurante (negativos), por hito. */
	milestoneOffsets: Record<MilestoneKey, number>;
	/** Objetivo OTIF en %. */
	otifTarget: number;
};

export const DEFAULT_SETTINGS: PortalSettings = {
	milestoneOffsets: MILESTONE_OFFSETS,
	otifTarget: 97
};

export async function getSettings(): Promise<PortalSettings> {
	const rows = await db.select().from(settings);
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<PortalSettings>;
	return {
		milestoneOffsets: { ...DEFAULT_SETTINGS.milestoneOffsets, ...(map.milestoneOffsets ?? {}) },
		otifTarget: map.otifTarget ?? DEFAULT_SETTINGS.otifTarget
	};
}

export class SettingsError extends Error {}

export async function saveSettings(
	actor: Actor,
	next: PortalSettings,
	meta: { ip?: string | null; userAgent?: string | null } = {}
) {
	if (!can(actor, 'settings.edit')) throw new SettingsError('Sin permiso');
	const problem = offsetsProblem(next.milestoneOffsets);
	if (problem) throw new SettingsError(problem);
	const before = await getSettings();
	for (const [key, value] of Object.entries(next) as [keyof PortalSettings, unknown][]) {
		await db
			.insert(settings)
			.values({ key, value, updatedBy: actor.id })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value, updatedBy: actor.id, updatedAt: new Date() }
			});
	}
	await audit({
		userId: actor.id,
		action: 'settings.updated',
		entity: 'settings',
		before,
		after: next,
		...meta
	});
}
