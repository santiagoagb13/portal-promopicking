import { fail, redirect } from '@sveltejs/kit';
import { readSheet } from 'read-excel-file/node';
import { z } from '$lib/schemas/z';
import {
	CLOSED_VALUES,
	DELIVERY_POINTS,
	editableFields,
	FIELD_LABEL,
	MASTER_FIELDS,
	parseCsv,
	VERSION_FIELDS,
	type MasterField
} from '$lib/domain/master';
import { can } from '$lib/permissions';
import {
	createRestaurant,
	getRestaurant,
	listRestaurants,
	masterSummary,
	MasterError,
	previewImport,
	restaurantHistory,
	setRestaurantActive,
	updateRestaurant,
	validateMaster
} from '$lib/server/services/master';
import type { Actions, PageServerLoad } from './$types';

/** Tamaño máximo del Excel del maestro. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:maestro');
	const actor = locals.user!;
	const sp = url.searchParams;
	const summary = await masterSummary(actor);
	const brand = summary.some((b) => b.code === sp.get('marca')?.toUpperCase())
		? sp.get('marca')!.toUpperCase()
		: undefined;
	const q = sp.get('q')?.trim().slice(0, 80) || undefined;
	const inactive = sp.has('bajas');
	const fichaId = sp.get('ficha');
	const [rows, ficha] = await Promise.all([
		listRestaurants(actor, { brand, q, inactive }),
		fichaId ? getRestaurant(actor, fichaId) : null
	]);
	return {
		title: 'Maestro de restaurantes',
		summary,
		brand: brand ?? null,
		q: q ?? '',
		inactive,
		rows,
		ficha: ficha ? { ...ficha, history: await restaurantHistory(ficha.id) } : null,
		editable: editableFields(actor.role),
		closed: CLOSED_VALUES,
		deliveryPoints: DELIVERY_POINTS,
		canCreate: can(actor, 'restaurant.create'),
		canImport: can(actor, 'restaurant.import'),
		openNew: can(actor, 'restaurant.create') && sp.has('alta'),
		openImport: can(actor, 'restaurant.import') && sp.has('importar')
	};
};

const meta = (request: Request, ip: string) => ({
	ip,
	userAgent: request.headers.get('user-agent')
});

function fieldsFrom(form: FormData): Partial<Record<MasterField, string>> {
	const out: Partial<Record<MasterField, string>> = {};
	for (const f of MASTER_FIELDS) {
		const v = form.get(f.key);
		if (typeof v === 'string') out[f.key] = v;
	}
	return out;
}

const id = z.string().regex(/^[A-Z]{2}-\d{4}$/);

export const actions: Actions = {
	/**
	 * Guardar la ficha. Si cambia tarifa, idioma o surtido (cambia la versión que recibe el
	 * restaurante), primero se pide confirmación y se vuelve a enviar con `confirmado`.
	 */
	guardar: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const rid = id.safeParse(form.get('id'));
		if (!rid.success) return fail(400, { save: { error: 'Restaurante no válido' } });
		const input = fieldsFrom(form);
		const before = await getRestaurant(locals.user!, rid.data);
		if (!before) return fail(404, { save: { error: 'Restaurante no encontrado' } });
		const versionChanges = VERSION_FIELDS.filter(
			(k) =>
				k in input &&
				editableFields(locals.user!.role).includes(k) &&
				(before[k] ?? '') !== (input[k] ?? '')
		);
		if (versionChanges.length && form.get('confirmado') !== '1')
			return fail(409, {
				save: {
					confirm: versionChanges.map((k) => ({
						label: FIELD_LABEL[k],
						from: before[k],
						to: input[k] ?? ''
					})),
					values: input
				}
			});
		try {
			const changed = await updateRestaurant(
				locals.user!,
				rid.data,
				input,
				meta(request, getClientAddress())
			);
			return { toast: changed.length ? 'Ficha guardada' : 'Sin cambios' };
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { save: { error: e.message, values: input } });
			throw e;
		}
	},
	alta: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const input = {
			...fieldsFrom(form),
			id: String(form.get('id') ?? ''),
			brandCode: String(form.get('brandCode') ?? '')
		};
		try {
			const rid = await createRestaurant(locals.user!, input, meta(request, getClientAddress()));
			redirect(303, `/maestro?ficha=${rid}`);
		} catch (e) {
			if (e instanceof MasterError)
				return fail(400, { create: { error: e.message, values: input } });
			throw e;
		}
	},
	baja: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const rid = id.safeParse(form.get('id'));
		if (!rid.success) return fail(400);
		const r = await getRestaurant(locals.user!, rid.data);
		if (!r) return fail(404);
		if (String(form.get('confirmacion') ?? '').trim() !== r.name)
			return fail(400, { save: { error: 'Escribe el nombre exacto del restaurante' } });
		try {
			await setRestaurantActive(locals.user!, rid.data, false, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { save: { error: e.message } });
			throw e;
		}
		return { toast: 'Restaurante dado de baja' };
	},
	reactivar: async ({ request, locals, getClientAddress }) => {
		const rid = id.safeParse((await request.formData()).get('id'));
		if (!rid.success) return fail(400);
		try {
			await setRestaurantActive(locals.user!, rid.data, true, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { save: { error: e.message } });
			throw e;
		}
		return { toast: 'Restaurante reactivado' };
	},
	validar: async ({ request, locals, getClientAddress }) => {
		const brand = z
			.string()
			.min(1)
			.max(10)
			.safeParse((await request.formData()).get('brand'));
		if (!brand.success) return fail(400);
		try {
			await validateMaster(locals.user!, brand.data, meta(request, getClientAddress()));
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { validate: { error: e.message } });
			throw e;
		}
		return { toast: 'Maestro validado' };
	},
	importar: async ({ request, locals, getClientAddress }) => {
		const file = (await request.formData()).get('fichero');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { import: { error: 'Elige un fichero' } });
		if (file.size > MAX_IMPORT_BYTES)
			return fail(400, { import: { error: 'El fichero pasa de 5 MB' } });
		const bytes = Buffer.from(await file.arrayBuffer());
		// Tipo real por la firma: un .xlsx es un ZIP («PK»); si no, se trata como CSV de texto.
		const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
		let table: (string | number | null)[][];
		try {
			if (isXlsx) {
				const sheet = await readSheet(bytes);
				table = sheet.map((row) =>
					row.map((c) =>
						c === null || c === undefined
							? null
							: c instanceof Date
								? c.toISOString().slice(0, 10)
								: (c as string | number)
					)
				);
			} else {
				const text = bytes.toString('utf8');
				if (text.includes('\u0000'))
					return fail(400, { import: { error: 'Sube un .xlsx o un .csv' } });
				table = parseCsv(text);
			}
		} catch {
			return fail(400, { import: { error: 'No se puede leer el fichero' } });
		}
		let importId: string;
		try {
			importId = await previewImport(
				locals.user!,
				file.name.slice(0, 120),
				table,
				meta(request, getClientAddress())
			);
		} catch (e) {
			if (e instanceof MasterError) return fail(400, { import: { error: e.message } });
			throw e;
		}
		redirect(303, `/maestro/importar/${importId}`);
	}
};
