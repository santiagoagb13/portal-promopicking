import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import {
	changedFields,
	diffImport,
	editableFields,
	MASTER_FIELDS,
	optionsFor,
	restaurantIdOk,
	type ImportDiff,
	type MasterField,
	type RestaurantRecord
} from '$lib/domain/master';
import { can, visibleBrands, type Actor } from '$lib/permissions';
import { audit } from '../audit';
import { db, tables } from '../db';

const { restaurants, brands, auditLog, users, masterImports, masterValidations } = tables;

type Meta = { ip?: string | null; userAgent?: string | null };
export class MasterError extends Error {}

const COLS = {
	id: restaurants.id,
	brandCode: restaurants.brandCode,
	name: restaurants.name,
	city: restaurants.city,
	address: restaurants.address,
	tariff: restaurants.tariff,
	language: restaurants.language,
	assortment: restaurants.assortment,
	facade: restaurants.facade,
	deliveryPoint: restaurants.deliveryPoint,
	active: restaurants.active
};

function scope(actor: Actor) {
	const b = visibleBrands(actor);
	return b === null ? undefined : inArray(restaurants.brandCode, b.length ? b : ['']);
}

export async function listRestaurants(
	actor: Actor,
	opts: { brand?: string; q?: string; inactive?: boolean } = {}
) {
	return db
		.select({ ...COLS, updatedAt: restaurants.updatedAt })
		.from(restaurants)
		.where(
			and(
				scope(actor),
				opts.brand ? eq(restaurants.brandCode, opts.brand) : undefined,
				opts.inactive ? undefined : eq(restaurants.active, true),
				opts.q
					? sql`(${restaurants.name} ilike ${'%' + opts.q + '%'} or ${restaurants.id} ilike ${'%' + opts.q + '%'} or ${restaurants.city} ilike ${'%' + opts.q + '%'})`
					: undefined
			)
		)
		.orderBy(asc(restaurants.brandCode), asc(restaurants.id));
}

/** KPI por marca (8.10): activos, total y última validación trimestral. */
export async function masterSummary(actor: Actor) {
	const visible = visibleBrands(actor);
	const [brandRows, counts, validations] = await Promise.all([
		db.select().from(brands).orderBy(desc(brands.restaurantCount)),
		db
			.select({
				brandCode: restaurants.brandCode,
				active: sql<number>`count(*) filter (where ${restaurants.active})::int`,
				total: count()
			})
			.from(restaurants)
			.groupBy(restaurants.brandCode),
		db
			.select({ brandCode: masterValidations.brandCode, at: max(masterValidations.validatedAt) })
			.from(masterValidations)
			.groupBy(masterValidations.brandCode)
	]);
	return brandRows
		.filter((b) => visible === null || visible.includes(b.code))
		.map((b) => ({
			code: b.code,
			name: b.name,
			short: b.short,
			prefix: b.idPrefix,
			active: counts.find((c) => c.brandCode === b.code)?.active ?? 0,
			total: counts.find((c) => c.brandCode === b.code)?.total ?? 0,
			validatedAt: validations.find((v) => v.brandCode === b.code)?.at ?? null,
			canValidate: can(actor, 'master.validate', { brandCode: b.code })
		}));
}

export async function getRestaurant(actor: Actor, id: string) {
	const [r] = await db
		.select(COLS)
		.from(restaurants)
		.where(and(eq(restaurants.id, id), scope(actor)));
	return r ?? null;
}

/** Histórico de la ficha, desde la auditoría. */
export async function restaurantHistory(id: string) {
	return db
		.select({
			at: auditLog.at,
			action: auditLog.action,
			before: auditLog.before,
			after: auditLog.after,
			userName: users.name
		})
		.from(auditLog)
		.leftJoin(users, eq(users.id, auditLog.userId))
		.where(and(eq(auditLog.entity, 'restaurant'), eq(auditLog.entityId, id)))
		.orderBy(desc(auditLog.at))
		.limit(20);
}

function clean(
	brand: string,
	input: Partial<Record<MasterField, string | null>>,
	fields: MasterField[]
) {
	const out: Partial<Record<MasterField, string | null>> = {};
	for (const f of MASTER_FIELDS) {
		if (!fields.includes(f.key) || !(f.key in input)) continue;
		const v = (input[f.key] ?? '').trim();
		if (f.required && !v) throw new MasterError(`Falta ${f.label.toLowerCase()}`);
		const options = optionsFor(brand, f.key);
		if (options && v && !options.includes(v)) throw new MasterError(`${f.label} no válida`);
		out[f.key] = v || null;
	}
	return out;
}

/** Guarda la ficha. Solo los campos que el rol puede editar; devuelve los que cambiaron. */
export async function updateRestaurant(
	actor: Actor,
	id: string,
	input: Partial<Record<MasterField, string | null>>,
	meta: Meta = {}
) {
	const before = await getRestaurant(actor, id);
	if (!before) throw new MasterError('Restaurante no encontrado');
	if (!can(actor, 'restaurant.edit', { brandCode: before.brandCode }))
		throw new MasterError('No puedes editar este restaurante');
	const data = clean(before.brandCode, input, editableFields(actor.role));
	const changed = changedFields(before, data);
	if (!changed.length) return [];
	await db
		.update(restaurants)
		// `clean()` ya ha comprobado que los campos obligatorios no van vacíos.
		.set({
			...(data as Partial<typeof restaurants.$inferInsert>),
			updatedBy: actor.id,
			updatedAt: new Date()
		})
		.where(eq(restaurants.id, id));
	await audit({
		userId: actor.id,
		action: 'restaurant.updated',
		entity: 'restaurant',
		entityId: id,
		before: Object.fromEntries(changed.map((k) => [k, before[k]])),
		after: Object.fromEntries(changed.map((k) => [k, data[k]])),
		...meta
	});
	return changed;
}

export async function createRestaurant(
	actor: Actor,
	input: Partial<Record<MasterField | 'id' | 'brandCode', string>>,
	meta: Meta = {}
) {
	if (!can(actor, 'restaurant.create')) throw new MasterError('No puedes dar de alta restaurantes');
	const brandCode = (input.brandCode ?? '').toUpperCase();
	const [brand] = await db.select().from(brands).where(eq(brands.code, brandCode));
	if (!brand) throw new MasterError('Elige una marca');
	const id = (input.id ?? '').trim().toUpperCase();
	if (!restaurantIdOk(id, brand.idPrefix))
		throw new MasterError(`El código debe ser ${brand.idPrefix}-0000`);
	const [exists] = await db
		.select({ id: restaurants.id })
		.from(restaurants)
		.where(eq(restaurants.id, id));
	if (exists) throw new MasterError('Ya existe un restaurante con ese código');
	const data = clean(
		brandCode,
		input,
		MASTER_FIELDS.map((f) => f.key)
	);
	for (const f of MASTER_FIELDS)
		if (f.required && !data[f.key]) throw new MasterError(`Falta ${f.label.toLowerCase()}`);
	await db.insert(restaurants).values({
		id,
		brandCode,
		name: data.name!,
		city: data.city!,
		address: data.address!,
		tariff: data.tariff!,
		language: data.language!,
		assortment: data.assortment!,
		facade: data.facade ?? null,
		deliveryPoint: data.deliveryPoint!,
		updatedBy: actor.id
	});
	await audit({
		userId: actor.id,
		action: 'restaurant.created',
		entity: 'restaurant',
		entityId: id,
		after: { brandCode, ...data },
		...meta
	});
	return id;
}

export async function setRestaurantActive(
	actor: Actor,
	id: string,
	active: boolean,
	meta: Meta = {}
) {
	if (!can(actor, 'restaurant.create')) throw new MasterError('No puedes dar de baja restaurantes');
	const before = await getRestaurant(actor, id);
	if (!before) throw new MasterError('Restaurante no encontrado');
	if (before.active === active) return;
	await db
		.update(restaurants)
		.set({ active, updatedBy: actor.id, updatedAt: new Date() })
		.where(eq(restaurants.id, id));
	await audit({
		userId: actor.id,
		action: active ? 'restaurant.reactivated' : 'restaurant.deactivated',
		entity: 'restaurant',
		entityId: id,
		before: { active: before.active },
		after: { active },
		...meta
	});
}

export async function validateMaster(actor: Actor, brandCode: string, meta: Meta = {}) {
	if (!can(actor, 'master.validate', { brandCode }))
		throw new MasterError('No puedes validar esta marca');
	const [{ n } = { n: 0 }] = await db
		.select({ n: count() })
		.from(restaurants)
		.where(and(eq(restaurants.brandCode, brandCode), eq(restaurants.active, true)));
	await db
		.insert(masterValidations)
		.values({ brandCode, validatedBy: actor.id, restaurantCount: n });
	await audit({
		userId: actor.id,
		action: 'master.validated',
		entity: 'brand',
		entityId: brandCode,
		after: { restaurants: n },
		...meta
	});
}

/* ---------- Importación de Excel (subir → previsualizar → confirmar) ---------- */

export async function prefixes() {
	const rows = await db.select({ code: brands.code, prefix: brands.idPrefix }).from(brands);
	return Object.fromEntries(rows.map((r) => [r.code, r.prefix]));
}

export async function previewImport(
	actor: Actor,
	fileName: string,
	table: (string | number | null | undefined)[][],
	meta: Meta = {}
) {
	if (!can(actor, 'restaurant.import')) throw new MasterError('No puedes importar el maestro');
	const existing = (await db.select(COLS).from(restaurants)) as RestaurantRecord[];
	const p = await prefixes();
	const allowed = visibleBrands(actor) ?? Object.keys(p);
	const { brands: brandCodes, ...diff } = diffImport(table, existing, allowed, p);
	const id = randomUUID();
	await db.insert(masterImports).values({ id, fileName, brandCodes, diff, uploadedBy: actor.id });
	await audit({
		userId: actor.id,
		action: 'master.import_previewed',
		entity: 'master_import',
		entityId: id,
		after: {
			fileName,
			added: diff.added.length,
			changed: diff.changed.length,
			removed: diff.removed.length,
			errors: diff.errors.length
		},
		...meta
	});
	return id;
}

export async function getImport(id: string) {
	const [row] = await db.select().from(masterImports).where(eq(masterImports.id, id));
	return row ?? null;
}

/** Aplica una importación previsualizada, en una transacción. No se aplica si tiene errores. */
export async function applyImport(actor: Actor, id: string, meta: Meta = {}) {
	if (!can(actor, 'restaurant.import')) throw new MasterError('No puedes importar el maestro');
	const imp = await getImport(id);
	if (!imp || imp.appliedAt) throw new MasterError('La importación ya no está pendiente');
	const diff: ImportDiff = imp.diff;
	if (diff.errors.length)
		throw new MasterError('Corrige los errores del fichero y vuelve a subirlo');
	await db.transaction(async (tx) => {
		const done = await tx
			.update(masterImports)
			.set({ appliedAt: new Date(), appliedBy: actor.id })
			.where(and(eq(masterImports.id, id), isNull(masterImports.appliedAt)))
			.returning({ id: masterImports.id });
		if (!done.length) throw new MasterError('La importación ya no está pendiente');
		for (const r of diff.added)
			await tx.insert(restaurants).values({
				id: r.id!,
				brandCode: r.brandCode!,
				name: r.name!,
				city: r.city!,
				address: r.address!,
				tariff: r.tariff!,
				language: r.language!,
				assortment: r.assortment!,
				facade: r.facade || null,
				deliveryPoint: r.deliveryPoint!,
				updatedBy: actor.id
			});
		for (const c of diff.changed) {
			const set: Record<string, unknown> = { updatedBy: actor.id, updatedAt: new Date() };
			for (const [k, v] of Object.entries(c.changes)) set[k] = k === 'active' ? true : v.to;
			await tx.update(restaurants).set(set).where(eq(restaurants.id, c.id));
		}
		if (diff.removed.length)
			await tx
				.update(restaurants)
				.set({ active: false, updatedBy: actor.id, updatedAt: new Date() })
				.where(
					inArray(
						restaurants.id,
						diff.removed.map((r) => r.id)
					)
				);
		// Una entrada por restaurante en la auditoría, para el histórico de cada ficha.
		for (const r of diff.added)
			await audit({
				userId: actor.id,
				action: 'restaurant.created',
				entity: 'restaurant',
				entityId: r.id,
				after: { ...r, importId: id },
				...meta
			});
		for (const c of diff.changed)
			await audit({
				userId: actor.id,
				action: 'restaurant.updated',
				entity: 'restaurant',
				entityId: c.id,
				before: Object.fromEntries(Object.entries(c.changes).map(([k, v]) => [k, v.from])),
				after: {
					...Object.fromEntries(Object.entries(c.changes).map(([k, v]) => [k, v.to])),
					importId: id
				},
				...meta
			});
		for (const r of diff.removed)
			await audit({
				userId: actor.id,
				action: 'restaurant.deactivated',
				entity: 'restaurant',
				entityId: r.id,
				after: { active: false, importId: id },
				...meta
			});
		await audit({
			userId: actor.id,
			action: 'master.imported',
			entity: 'master_import',
			entityId: id,
			after: {
				added: diff.added.length,
				changed: diff.changed.length,
				removed: diff.removed.length
			},
			...meta
		});
	});
	return { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length };
}
