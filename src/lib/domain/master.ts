/**
 * Maestro de restaurantes (8.10): campos, valores cerrados, qué puede editar cada parte y
 * comparación de una importación de Excel con lo que hay en la BD.
 */

export type MasterField =
	'name' | 'city' | 'address' | 'tariff' | 'language' | 'assortment' | 'facade' | 'deliveryPoint';

export type RestaurantRecord = {
	id: string;
	brandCode: string;
	name: string;
	city: string;
	address: string;
	tariff: string;
	language: string;
	assortment: string;
	facade: string | null;
	deliveryPoint: string;
	active: boolean;
};

export const MASTER_FIELDS: {
	key: MasterField;
	label: string;
	required: boolean;
	closed: boolean;
}[] = [
	{ key: 'name', label: 'Nombre', required: true, closed: false },
	{ key: 'city', label: 'Ciudad', required: true, closed: false },
	{ key: 'address', label: 'Dirección', required: true, closed: false },
	{ key: 'tariff', label: 'Tarifa', required: true, closed: true },
	{ key: 'language', label: 'Idioma', required: true, closed: true },
	{ key: 'assortment', label: 'Surtido', required: true, closed: true },
	{ key: 'facade', label: 'Fachada', required: false, closed: false },
	{ key: 'deliveryPoint', label: 'Entrega', required: true, closed: true }
];

export const FIELD_LABEL = Object.fromEntries(MASTER_FIELDS.map((f) => [f.key, f.label])) as Record<
	MasterField,
	string
>;

/**
 * Valores cerrados por marca, los del prototipo. Pasarán a Administración › Ajustes cuando haga
 * falta añadir uno sin desplegar.
 */
export const CLOSED_VALUES: Record<
	string,
	{ tariff: string[]; language: string[]; assortment: string[] }
> = {
	FH: {
		tariff: ['C1', 'C2', 'C3', 'C3+', 'WARNER'],
		language: ['SP', 'SP + EN', 'EN', 'CAT', 'GALL'],
		assortment: ['ALL', 'RED', 'RED+', 'WAR']
	},
	VIPS: {
		tariff: ['VIPS', 'VSM', 'HÍB'],
		language: ['CAST', 'CAT'],
		assortment: ['Completa', 'Smart', 'Híbrido']
	},
	GINOS: {
		tariff: ['M2', 'M3', 'M4'],
		language: ['CAST', 'CAT', 'ING turismo', 'Andalucía turismo'],
		assortment: ['Completa']
	}
};
export const DELIVERY_POINTS = ['Plataforma Promopicking', 'Directo restaurante'];

export function optionsFor(brand: string, field: MasterField): string[] | null {
	if (field === 'deliveryPoint') return DELIVERY_POINTS;
	if (field === 'tariff' || field === 'language' || field === 'assortment')
		return CLOSED_VALUES[brand]?.[field] ?? [];
	return null;
}

/**
 * Decisión pendiente 7 del plan (qué edita Alsea): mientras no se acuerde otra cosa, Alsea edita
 * los datos del restaurante y de su versión; el punto de entrega es logística de Promopicking.
 */
export const BRAND_EDITABLE: MasterField[] = [
	'name',
	'city',
	'address',
	'tariff',
	'language',
	'assortment',
	'facade'
];

/** Cambiar estos campos cambia qué versión de cada soporte recibe el restaurante: se confirma. */
export const VERSION_FIELDS: MasterField[] = ['tariff', 'language', 'assortment'];

export function editableFields(role: string): MasterField[] {
	if (role === 'admin' || role === 'ops') return MASTER_FIELDS.map((f) => f.key);
	if (role === 'brand') return BRAND_EDITABLE;
	return [];
}

export function restaurantIdOk(id: string, prefix: string): boolean {
	return new RegExp(`^${prefix}-\\d{4}$`).test(id);
}

/** Campos que cambian entre dos versiones de una ficha. */
export function changedFields(
	before: Partial<Record<MasterField, string | null>>,
	after: Partial<Record<MasterField, string | null>>
): MasterField[] {
	return MASTER_FIELDS.map((f) => f.key).filter(
		(k) => k in after && (before[k] ?? '') !== (after[k] ?? '')
	);
}

/* ---------- Importación ---------- */

const strip = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/** Cabeceras admitidas en el Excel (las de la exportación y algunas variantes habituales). */
const HEADERS: Record<string, keyof RestaurantRecord> = {
	codigo: 'id',
	id: 'id',
	restaurante: 'name',
	nombre: 'name',
	marca: 'brandCode',
	ciudad: 'city',
	poblacion: 'city',
	direccion: 'address',
	tarifa: 'tariff',
	idioma: 'language',
	surtido: 'assortment',
	fachada: 'facade',
	entrega: 'deliveryPoint',
	'punto de entrega': 'deliveryPoint'
};

export const EXPORT_HEADERS: [keyof RestaurantRecord, string][] = [
	['id', 'Código'],
	['brandCode', 'Marca'],
	['name', 'Nombre'],
	['city', 'Ciudad'],
	['address', 'Dirección'],
	['tariff', 'Tarifa'],
	['language', 'Idioma'],
	['assortment', 'Surtido'],
	['facade', 'Fachada'],
	['deliveryPoint', 'Entrega']
];

export type ImportDiff = {
	added: Record<string, string>[];
	changed: { id: string; changes: Record<string, { from: string | null; to: string | null }> }[];
	removed: { id: string; name: string }[];
	errors: { row: number; message: string }[];
};

/**
 * Compara las filas de un Excel (primera fila = cabeceras) con el maestro actual.
 * Solo se tocan las marcas que aparecen en el fichero y que están en `allowedBrands`;
 * los restaurantes activos de esas marcas que no estén en el fichero se proponen como bajas.
 */
export function diffImport(
	table: (string | number | null | undefined)[][],
	existing: RestaurantRecord[],
	allowedBrands: string[],
	prefixes: Record<string, string>
): ImportDiff & { brands: string[] } {
	const out: ImportDiff & { brands: string[] } = {
		added: [],
		changed: [],
		removed: [],
		errors: [],
		brands: []
	};
	const [head, ...rows] = table;
	if (!head) return { ...out, errors: [{ row: 1, message: 'El fichero está vacío' }] };
	const cols = head.map((h) => HEADERS[strip(String(h ?? ''))]);
	if (!cols.includes('id'))
		return { ...out, errors: [{ row: 1, message: 'Falta la columna «Código»' }] };

	const byId = new Map(existing.map((r) => [r.id, r]));
	const brandByPrefix = Object.fromEntries(Object.entries(prefixes).map(([b, p]) => [p, b]));
	const seen = new Set<string>();
	const brands = new Set<string>();

	rows.forEach((cells, i) => {
		const rowNo = i + 2;
		if (cells.every((c) => c === null || c === undefined || String(c).trim() === '')) return;
		const rec: Record<string, string> = {};
		cols.forEach((key, j) => {
			if (key) rec[key] = String(cells[j] ?? '').trim();
		});
		const id = (rec.id ?? '').toUpperCase();
		const brand = (rec.brandCode || brandByPrefix[id.split('-')[0] ?? ''] || '').toUpperCase();
		const error = (message: string) =>
			out.errors.push({ row: rowNo, message: `${id || 'Fila'}: ${message}` });
		if (!prefixes[brand]) return error('marca desconocida');
		if (!allowedBrands.includes(brand)) return error(`no puedes importar restaurantes de ${brand}`);
		if (!restaurantIdOk(id, prefixes[brand]!))
			return error(`el código debe ser ${prefixes[brand]}-0000`);
		if (seen.has(id)) return error('código repetido en el fichero');
		seen.add(id);
		brands.add(brand);
		const current = byId.get(id);
		if (current && current.brandCode !== brand) return error('el código es de otra marca');

		for (const f of MASTER_FIELDS) {
			const v = rec[f.key];
			if (v === undefined) {
				if (!current && f.required) return error(`falta ${f.label.toLowerCase()}`);
				continue;
			}
			if (f.required && !v) return error(`falta ${f.label.toLowerCase()}`);
			const options = optionsFor(brand, f.key);
			if (options && v && !options.includes(v))
				return error(`${f.label.toLowerCase()} «${v}» no es válida`);
		}
		if (!current) {
			out.added.push({ ...rec, id, brandCode: brand });
			return;
		}
		const changes: Record<string, { from: string | null; to: string | null }> = {};
		for (const f of MASTER_FIELDS) {
			const v = rec[f.key];
			if (v === undefined) continue;
			const from = current[f.key] ?? '';
			if (from !== v) changes[f.key] = { from: from || null, to: v || null };
		}
		if (!current.active) changes.active = { from: 'no', to: 'sí' };
		if (Object.keys(changes).length) out.changed.push({ id, changes });
	});

	for (const r of existing)
		if (brands.has(r.brandCode) && r.active && !seen.has(r.id))
			out.removed.push({ id: r.id, name: r.name });
	out.brands = [...brands];
	return out;
}

/* ---------- CSV (Excel en español usa «;») ---------- */

export function parseCsv(text: string): string[][] {
	const src = text.replace(/^\uFEFF/, '');
	const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
	const sep =
		(firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i]!;
		if (quoted) {
			if (c === '"' && src[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === sep) {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && src[i + 1] === '\n') i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += c;
	}
	if (cell !== '' || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
	const esc = (v: string | number | null | undefined) => {
		const s = v === null || v === undefined ? '' : String(v);
		return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return '\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
