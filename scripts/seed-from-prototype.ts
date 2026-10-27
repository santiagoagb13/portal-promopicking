/**
 * Seed desde el prototipo (sección 6.1 del plan).
 *
 * 1. Extrae de `portal.html` las constantes de datos y las funciones que las generan (`calDates`,
 *    `supportsOf`, `mkVersions`, `kitsOf`…) y las evalúa en un contexto aislado con `node:vm`.
 *    El resultado se guarda en `scripts/data/prototype.json`, que es lo que se usa cuando el
 *    prototipo no está disponible (CI, Vercel).
 * 2. Normaliza: fechas ISO, precios en céntimos, códigos de versión descompuestos, hitos.
 * 3. Puebla la BD de forma idempotente: vacía y vuelve a cargar los datos de dominio, actualiza
 *    los 5 usuarios de prueba (conservan sus passkeys) y deja una invitación pendiente nueva.
 *
 * Uso: npm run db:seed            (lee el prototipo si existe, si no la instantánea)
 *      npm run seed:extract       (solo regenera la instantánea)
 * El prototipo solo se lee; nunca se modifica.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { eq, inArray, sql } from 'drizzle-orm';
import { milestoneDone, MILESTONE_KEYS, type MilestoneKey } from '$lib/domain/campaign';
import { parseVersionCode } from '$lib/domain/version-code';
import { closeDb, db, tables } from '$lib/server/db';
import { loadActor } from '$lib/server/auth/actor';
import { createInvitation } from '$lib/server/services/invitations';
import type { Role } from '$lib/permissions';

const T = tables;

/** Fecha de referencia de los datos del prototipo (su constante TODAY). */
export const SEED_REFERENCE_DATE = '2026-10-22';
const SNAPSHOT = resolve('scripts/data/prototype.json');

/* ------------------------------------------------------------------ */
/* 1 · Extracción                                                       */
/* ------------------------------------------------------------------ */

/** Declaraciones de primer nivel que se copian del prototipo, en orden de dependencia. */
const DECLARATIONS = [
	'pad',
	'TODAY',
	'd',
	'addDays',
	'ymd',
	'USERS',
	'BRANDS',
	'RTES',
	'rteById',
	'CAMPAIGNS',
	'campById',
	'calDates',
	'supportsOf',
	'campStage',
	'campProgress',
	'mkVersions',
	'APPROVALS',
	'seedComments',
	'TICKETS',
	'kitLinesFor',
	'KITS',
	'kitsOf',
	'CATALOG',
	'ORDERS',
	'REPORTS'
];

const TOP_LEVEL =
	/^(const |let |var |function |\(function|\/\*|[A-Za-z_$][\w$]*\.[\w$]+\s*=|App\b|document\.|window\.)/;

/** Copia una declaración de primer nivel: desde su línea hasta la siguiente declaración de primer nivel. */
export function extractDeclaration(lines: string[], name: string): string {
	const start = lines.findIndex((l) =>
		new RegExp(`^(const|let|var) ${name}\\b|^function ${name}\\(|^\\(function ${name}\\(`).test(l)
	);
	if (start < 0) throw new Error(`No encuentro «${name}» en el prototipo`);
	let end = start + 1;
	while (end < lines.length && !TOP_LEVEL.test(lines[end]!)) end++;
	return lines.slice(start, end).join('\n');
}

export type Prototype = ReturnType<typeof evaluatePrototype>;

export function evaluatePrototype(html: string) {
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
	const main = scripts.find((s) => s.includes('const CAMPAIGNS'));
	if (!main) throw new Error('El prototipo no tiene el bloque de datos esperado');
	const lines = main.split('\n');
	const code = DECLARATIONS.map((n) => extractDeclaration(lines, n)).join('\n');
	const result = vm.runInNewContext(
		`${code}
;JSON.stringify({
	today: ymd(TODAY),
	users: USERS,
	brands: BRANDS,
	restaurants: RTES,
	campaigns: CAMPAIGNS.map(c => ({
		id: c.id, brand: c.brand, name: c.name, enRte: c.enRte, rtes: c.rtes, planned: !!c.planned,
		materials: c.materials, resp: c.resp, note: c.note || null,
		stage: campStage(c), progress: campProgress(c), dates: calDates(c.enRte),
		supports: supportsOf(c).map(s => ({ id: s.id, name: s.name, versions: s.versions, qty: s.qty, kit: s.kit, stage: s.stage, resp: s.resp, note: s.note || null, apr: s.apr || null })),
		kitLines: c.kitLines || []
	})),
	approvals: APPROVALS,
	tickets: TICKETS,
	kits: Object.fromEntries(CAMPAIGNS.filter(c => campStage(c) >= 4).map(c => [c.id, kitsOf(c.id).map(k => ({ ...k, lines: kitLinesFor(c, rteById(k.rte)) }))])),
	catalog: CATALOG,
	orders: ORDERS,
	reports: REPORTS
});`,
		{},
		{ timeout: 5000 }
	);
	return JSON.parse(result as string) as PrototypeData;
}

type Scan = { at: string; what: string; who: string };
type PrototypeData = {
	today: string;
	users: { id: string; name: string; role: string }[];
	brands: Record<string, { name: string; short: string; rtes: number }>;
	restaurants: {
		id: string;
		brand: string;
		name: string;
		city: string;
		addr: string;
		tarifa: string;
		idioma: string;
		surtido: string;
		fachada: string;
		entrega: string;
	}[];
	campaigns: {
		id: string;
		brand: string;
		name: string;
		enRte: string;
		rtes: number;
		planned: boolean;
		materials: string;
		resp: string;
		note: string | null;
		stage: number;
		progress: number;
		dates: Record<string, string>;
		supports: {
			id: string;
			name: string;
			versions: number;
			qty: number;
			kit: string;
			stage: number;
			resp: string;
			note: string | null;
			apr: string | null;
		}[];
	}[];
	approvals: Record<
		string,
		{
			campaign: string;
			supportId: string;
			support: string;
			brand: string;
			format: string;
			vLabel: string;
			prev: string;
			uploadedBy: string;
			versions: {
				code: string;
				kits: number | null;
				status: 'aprobada' | 'pendiente' | 'cambios';
				rev: number;
				by: string | null;
				at: string | null;
				comments: { who: string; at: string; txt: string }[];
				file: string;
				size: string;
			}[];
		}
	>;
	tickets: {
		id: string;
		campaign: string;
		type: 'Incidencia' | 'Consulta';
		kind: string;
		title: string;
		severity: 'alta' | 'media' | 'baja';
		state: 'Abierta' | 'En curso' | 'Respondida' | 'Cerrada';
		opened: string;
		by: string;
		rte: string | null;
		updates: { at: string; who: string; txt: string }[];
	}[];
	kits: Record<
		string,
		{
			id: string;
			rte: string;
			campaign: string;
			bultos: number;
			state: number;
			scans: Scan[];
			incidencia: string | null;
			receivedBy: string | null;
			lines: { name: string; ver: string; uds: number }[];
		}[]
	>;
	catalog: {
		id: string;
		cat: 'generico' | 'lsm';
		brand: string;
		name: string;
		desc: string;
		unit: string;
		price: number;
		lead: number;
	}[];
	orders: {
		id: string;
		rte: string;
		date: string;
		lines: { id: string; qty: number }[];
		state: string;
	}[];
	reports: unknown;
};

async function loadPrototype(onlyExtract: boolean): Promise<PrototypeData> {
	const htmlPath = resolve(process.env.PROTOTYPE_HTML ?? '../portal/portal.html');
	if (existsSync(htmlPath)) {
		const data = evaluatePrototype(await readFile(htmlPath, 'utf8'));
		await mkdir(dirname(SNAPSHOT), { recursive: true });
		await writeFile(SNAPSHOT, JSON.stringify(data, null, '\t') + '\n', 'utf8');
		console.info(`Prototipo leído de ${htmlPath}; instantánea actualizada en ${SNAPSHOT}`);
		return data;
	}
	if (onlyExtract) throw new Error(`No existe el prototipo en ${htmlPath}`);
	console.info(`Prototipo no disponible; uso la instantánea ${SNAPSHOT}`);
	return JSON.parse(await readFile(SNAPSHOT, 'utf8')) as PrototypeData;
}

/* ------------------------------------------------------------------ */
/* 2 · Normalización                                                    */
/* ------------------------------------------------------------------ */

/** «2026-10-21 17:40» en hora de Madrid → Date. */
export function madrid(s: string): Date {
	const [day, time = '12:00'] = s.trim().split(' ');
	const [y, m, d] = day!.split('-').map(Number) as [number, number, number];
	const [hh, mm] = time.split(':').map(Number) as [number, number];
	const guess = Date.UTC(y, m - 1, d, hh, mm);
	const offset = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Europe/Madrid',
		timeZoneName: 'longOffset'
	})
		.formatToParts(new Date(guess))
		.find((p) => p.type === 'timeZoneName')!
		.value.match(/GMT([+-])(\d{2}):(\d{2})/);
	const minutes = offset
		? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]))
		: 0;
	return new Date(guess - minutes * 60_000);
}

/** «3.2 MB» → bytes */
export function sizeToBytes(s: string): number {
	const m = s.match(/([\d.,]+)\s*(KB|MB|GB)/i);
	if (!m) return 0;
	const n = Number(m[1]!.replace(',', '.'));
	const unit = m[2]!.toUpperCase();
	return Math.round(n * (unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024));
}

/** «10 uds/kit» → 10; textos sin unidades por kit → null. */
export function perKitQty(s: string): number | null {
	const m = s.match(/^([\d.]+)\s*uds?\/kit/i);
	return m ? Number(m[1]!.replace(/\./g, '')) : null;
}

const MILESTONE_FROM_PROTOTYPE: Record<string, MilestoneKey> = {
	brief: 'brief',
	af: 'af',
	aprob: 'aprob',
	prodIni: 'prod_ini',
	prodFin: 'prod_fin',
	kitting: 'kitting',
	exped: 'exped',
	plataforma: 'plataforma',
	rte: 'rte'
};

const VERSION_STATUS = { aprobada: 'approved', pendiente: 'pending', cambios: 'changes' } as const;
const TICKET_TYPE = { Incidencia: 'incident', Consulta: 'query' } as const;
const TICKET_SEVERITY = { alta: 'high', media: 'medium', baja: 'low' } as const;
const TICKET_STATE = {
	Abierta: 'open',
	'En curso': 'in_progress',
	Respondida: 'answered',
	Cerrada: 'closed'
} as const;
const ORDER_STATE: Record<string, 'preparing' | 'shipping' | 'delivered'> = {
	'En preparación': 'preparing',
	'En reparto': 'shipping',
	Entregado: 'delivered'
};
const KIT_EVENTS = ['prepared', 'shipped', 'hub_in', 'out_for_delivery', 'received'] as const;

/* ------------------------------------------------------------------ */
/* 3 · Usuarios de prueba (perfiles de la sección 2.1)                   */
/* ------------------------------------------------------------------ */

type SeedUser = {
	prototypeId: string;
	id: string;
	email: string;
	role: Role;
	organization: string;
	brands?: string[];
	restaurants?: string[];
};

/** Los 5 perfiles del prototipo con su ámbito. Jorge (Promopicking) es quien administra. */
export const SEED_USERS: SeedUser[] = [
	{
		prototypeId: 'alsea-fh',
		id: 'u-marta-ruiz',
		email: 'marta.ruiz@alsea.example',
		role: 'brand',
		organization: 'Alsea',
		brands: ['FH']
	},
	{
		prototypeId: 'alsea-vips',
		id: 'u-carlos-vega',
		email: 'carlos.vega@alsea.example',
		role: 'brand',
		organization: 'Alsea',
		brands: ['VIPS']
	},
	{
		prototypeId: 'alsea-ginos',
		id: 'u-laura-pons',
		email: 'laura.pons@alsea.example',
		role: 'brand',
		organization: 'Alsea',
		brands: ['GINOS']
	},
	{
		prototypeId: 'promopicking',
		id: 'u-jorge-martin',
		email: 'jorge.martin@promopicking.example',
		role: 'admin',
		organization: 'Promopicking'
	},
	{
		prototypeId: 'rte',
		id: 'u-ana-soler',
		email: 'ana.soler@fosters.example',
		role: 'manager',
		organization: 'FH Plenilunio',
		restaurants: ['FH-0147']
	}
];

/** Invitación pendiente de ejemplo: «Jorge Martín te invita como Gerente · FH Gran Vía 48». */
export const SEED_INVITATION = {
	email: 'gerente.granvia48@fosters.example',
	name: 'Pablo Gil',
	role: 'manager' as const,
	restaurants: ['FH-0012']
};

/* ------------------------------------------------------------------ */
/* 4 · Carga                                                            */
/* ------------------------------------------------------------------ */

async function seed(p: PrototypeData) {
	const userByName = new Map<string, string>();
	for (const su of SEED_USERS) {
		const pu = p.users.find((u) => u.id === su.prototypeId);
		if (!pu) throw new Error(`Falta el usuario ${su.prototypeId} en el prototipo`);
		userByName.set(pu.name, su.id);
	}
	const who = (label: string | null | undefined) =>
		label ? (userByName.get(label.split(' · ')[0]!) ?? null) : null;
	const today = p.today;

	await db.transaction(async (tx) => {
		await tx.execute(sql`truncate master_imports, master_validations, kit_events, kit_lines, kits, version_comments, support_versions, qr_codes,
			supports, campaign_milestones, ticket_updates, tickets, order_lines, orders, catalog_items, campaigns`);
		// Contadores de intentos a cero: el seed deja el entorno listo para probar.
		await tx.execute(sql`truncate rate_limits`);

		// Marcas y restaurantes: upsert (las cuentas invitadas pueden apuntar a ellos).
		for (const [code, b] of Object.entries(p.brands)) {
			// El prefijo de los códigos (FH, VI, GI) sale de los restaurantes de la marca.
			const idPrefix =
				p.restaurants.find((r) => r.brand === code)?.id.split('-')[0] ?? code.slice(0, 2);
			const row = { name: b.name, short: b.short, restaurantCount: b.rtes, idPrefix };
			await tx
				.insert(T.brands)
				.values({ code, ...row })
				.onConflictDoUpdate({ target: T.brands.code, set: row });
		}
		for (const r of p.restaurants) {
			const row = {
				id: r.id,
				brandCode: r.brand,
				name: r.name,
				city: r.city,
				address: r.addr,
				tariff: r.tarifa,
				language: r.idioma,
				assortment: r.surtido,
				facade: r.fachada === '—' ? null : r.fachada,
				deliveryPoint: r.entrega,
				active: true
			};
			await tx
				.insert(T.restaurants)
				.values(row)
				.onConflictDoUpdate({ target: T.restaurants.id, set: row });
		}

		// Restaurantes dados de alta a mano después del seed: fuera, salvo que una cuenta los tenga en su ámbito.
		const ids = p.restaurants.map((r) => r.id);
		await tx.execute(sql`delete from restaurants r where r.id not in ${ids}
			and not exists (select 1 from user_restaurants ur where ur.restaurant_id = r.id)`);

		// Usuarios de prueba: upsert por id; conservan passkeys y sesiones entre seeds.
		for (const su of SEED_USERS) {
			const pu = p.users.find((u) => u.id === su.prototypeId)!;
			const row = {
				id: su.id,
				email: su.email,
				name: pu.name,
				emailVerified: true,
				role: su.role,
				status: 'active' as const,
				organization: su.organization
			};
			await tx.insert(T.users).values(row).onConflictDoUpdate({ target: T.users.id, set: row });
			await tx.delete(T.userBrands).where(eq(T.userBrands.userId, su.id));
			await tx.delete(T.userRestaurants).where(eq(T.userRestaurants.userId, su.id));
			if (su.brands?.length)
				await tx
					.insert(T.userBrands)
					.values(su.brands.map((brandCode) => ({ userId: su.id, brandCode })));
			if (su.restaurants?.length)
				await tx
					.insert(T.userRestaurants)
					.values(su.restaurants.map((restaurantId) => ({ userId: su.id, restaurantId })));
		}

		// Campañas, hitos y soportes.
		const approvalBySupport = new Map(
			Object.entries(p.approvals).map(([k, a]) => [a.supportId, { key: k, ...a }])
		);
		for (const c of p.campaigns) {
			await tx.insert(T.campaigns).values({
				id: c.id,
				brandCode: c.brand,
				name: c.name,
				inRestaurantOn: c.enRte,
				restaurantCount: c.rtes,
				ownerUserId: userByName.get(c.resp) ?? null,
				planned: c.planned,
				materials: c.materials,
				notes: c.note,
				createdAt: madrid(`${c.dates.brief} 09:00`)
			});
			await tx.insert(T.campaignMilestones).values(
				Object.entries(c.dates).map(([k, due]) => {
					const key = MILESTONE_FROM_PROTOTYPE[k]!;
					const done = !c.planned && milestoneDone(key, c.stage, due, today);
					return {
						campaignId: c.id,
						key,
						dueOn: due,
						doneAt: done ? madrid(`${due} 18:00`) : null
					};
				})
			);
			await tx.insert(T.supports).values(
				c.supports.map((s, i) => {
					const apr = approvalBySupport.get(s.id);
					return {
						id: s.id,
						campaignId: c.id,
						position: i,
						name: s.name,
						versionsPlanned: s.versions,
						runQty: s.qty,
						perKitQty: perKitQty(s.kit),
						packaging: s.kit,
						stage: s.stage,
						responsible: s.resp,
						notes: s.note,
						artworkFormat: apr?.format ?? null,
						artworkLabel: apr?.vLabel ?? null,
						artworkPrevLabel: apr?.prev ?? null
					};
				})
			);
		}
		if (MILESTONE_KEYS.length !== Object.keys(MILESTONE_FROM_PROTOTYPE).length)
			throw new Error('Hitos desalineados');

		// Artes finales: versiones y comentarios.
		for (const [key, a] of Object.entries(p.approvals)) {
			const uploader = who(a.uploadedBy);
			for (const [i, v] of a.versions.entries()) {
				const parsed = parseVersionCode(v.code);
				const id = `sv-${key}-${String(i + 1).padStart(2, '0')}`;
				await tx.insert(T.supportVersions).values({
					id,
					supportId: a.supportId,
					code: parsed.code,
					tariff: parsed.tariff,
					assortment: parsed.assortment,
					language: parsed.language,
					variant: parsed.variant,
					kitsCount: v.kits,
					status: VERSION_STATUS[v.status],
					revision: v.rev,
					fileKey: `artes/${a.campaign}/${v.file}`,
					fileSize: sizeToBytes(v.size),
					uploadedBy: uploader,
					decidedBy: v.status === 'aprobada' ? who(v.by) : null,
					decidedAt: v.status === 'aprobada' && v.at ? madrid(v.at) : null
				});
				for (const [j, cm] of v.comments.entries())
					await tx.insert(T.versionComments).values({
						id: `${id}-c${j + 1}`,
						versionId: id,
						userId: who(cm.who),
						authorLabel: cm.who,
						at: madrid(cm.at),
						text: cm.txt
					});
			}
		}

		// Soporte.
		for (const t of p.tickets) {
			const closed = t.state === 'Cerrada';
			await tx.insert(T.tickets).values({
				id: t.id,
				campaignId: t.campaign,
				restaurantId: t.rte,
				type: TICKET_TYPE[t.type],
				kind: t.kind,
				title: t.title,
				severity: TICKET_SEVERITY[t.severity],
				state: TICKET_STATE[t.state],
				openedBy: who(t.by),
				openedByLabel: t.by,
				openedAt: madrid(t.opened),
				closedAt: closed ? madrid(t.updates.at(-1)?.at ?? t.opened) : null
			});
			if (t.updates.length)
				await tx.insert(T.ticketUpdates).values(
					t.updates.map((u) => ({
						ticketId: t.id,
						at: madrid(u.at),
						userId: who(u.who),
						authorLabel: u.who,
						text: u.txt
					}))
				);
		}

		// Kits generados con la lógica de muestra del prototipo (solo campañas en kitting o después).
		for (const [campaignId, list] of Object.entries(p.kits)) {
			const supportsOfCampaign = p.campaigns.find((c) => c.id === campaignId)!.supports;
			for (const k of list) {
				const last = k.scans.at(-1);
				await tx.insert(T.kits).values({
					id: k.id,
					campaignId,
					restaurantId: k.rte,
					parcels: k.bultos,
					state: k.state,
					incidentTicketId: k.incidencia,
					receivedBy: k.receivedBy,
					receivedAt: k.state === 4 && last ? madrid(last.at) : null
				});
				await tx.insert(T.kitEvents).values(
					k.scans.map((s, i) => ({
						kitId: k.id,
						at: madrid(s.at),
						type: KIT_EVENTS[i]!,
						byLabel: s.who,
						source: i === 4 ? ('mobile' as const) : ('scanner' as const)
					}))
				);
				const incident = k.incidencia ? p.tickets.find((t) => t.id === k.incidencia) : undefined;
				if (incident)
					await tx.insert(T.kitEvents).values({
						kitId: k.id,
						at: madrid(incident.opened),
						type: 'incident',
						byLabel: incident.by,
						source: 'scanner'
					});
				if (k.lines.length)
					await tx.insert(T.kitLines).values(
						k.lines.map((l) => ({
							kitId: k.id,
							supportId:
								supportsOfCampaign.find((s) =>
									s.name.toLowerCase().startsWith(l.name.toLowerCase())
								)?.id ?? null,
							label: l.name,
							versionCode: l.ver,
							qty: l.uds
						}))
					);
			}
		}

		// Reposiciones.
		await tx.insert(T.catalogItems).values(
			p.catalog.map((i) => ({
				id: i.id,
				category: i.cat === 'generico' ? ('generic' as const) : ('lsm' as const),
				brandCode: i.brand === 'ALL' ? null : i.brand,
				name: i.name,
				description: i.desc,
				unit: i.unit,
				priceCents: Math.round(i.price * 100),
				leadDays: i.lead
			}))
		);
		const price = new Map(p.catalog.map((i) => [i.id, Math.round(i.price * 100)]));
		const manager = SEED_USERS.find((u) => u.role === 'manager')!;
		for (const o of p.orders) {
			await tx.insert(T.orders).values({
				id: o.id,
				restaurantId: o.rte,
				placedBy: manager.restaurants?.includes(o.rte) ? manager.id : null,
				placedAt: madrid(o.date),
				state: ORDER_STATE[o.state] ?? 'preparing',
				source: 'web'
			});
			await tx.insert(T.orderLines).values(
				o.lines.map((l) => ({
					orderId: o.id,
					itemId: l.id,
					qty: l.qty,
					unitPriceCents: price.get(l.id)!
				}))
			);
		}

		// Notificaciones de ejemplo para la campana.
		const seedIds = SEED_USERS.map((u) => u.id);
		await tx.delete(T.notifications).where(inArray(T.notifications.userId, seedIds));
		const pendingByBrand = new Map<string, number>();
		for (const a of Object.values(p.approvals))
			pendingByBrand.set(
				a.brand,
				(pendingByBrand.get(a.brand) ?? 0) +
					a.versions.filter((v) => v.status !== 'aprobada').length
			);
		const notes = SEED_USERS.filter(
			(u) => u.role === 'brand' && pendingByBrand.get(u.brands![0]!)
		).map((u) => ({
			id: `n-${u.id}-pendientes`,
			userId: u.id,
			kind: 'artwork.pending',
			title: `${pendingByBrand.get(u.brands![0]!)} versiones pendientes de aprobar`,
			href: '/aprobaciones',
			createdAt: madrid(`${today} 08:30`)
		}));
		const open = p.tickets.find((t) => t.type === 'Incidencia' && t.state !== 'Cerrada');
		if (open)
			notes.push({
				id: 'n-u-jorge-martin-incidencia',
				userId: 'u-jorge-martin',
				kind: 'ticket.incident',
				title: `${open.id} · ${open.kind}`,
				href: '/soporte',
				createdAt: madrid(open.opened)
			});
		await tx.insert(T.notifications).values(notes);
	});

	// Invitación pendiente: se borra cualquier cuenta o invitación anterior de ese correo y se envía otra.
	await db.delete(T.users).where(eq(T.users.email, SEED_INVITATION.email));
	await db.delete(T.invitations).where(eq(T.invitations.email, SEED_INVITATION.email));
	const jorge = await loadActor('u-jorge-martin');
	const { token } = await createInvitation(
		jorge!,
		{
			email: SEED_INVITATION.email,
			name: SEED_INVITATION.name,
			role: SEED_INVITATION.role,
			brands: [],
			restaurants: SEED_INVITATION.restaurants
		},
		{},
		// En las previsualizaciones de Vercel no se envía (el correo de prueba no existe): el enlace va al registro.
		{ sendMail: !process.env.VERCEL_ENV }
	);
	return { token };
}

async function main() {
	const onlyExtract = process.argv.includes('--solo-extraer');
	const data = await loadPrototype(onlyExtract);
	if (data.today !== SEED_REFERENCE_DATE)
		console.warn(
			`Aviso: la fecha de referencia del prototipo es ${data.today}, no ${SEED_REFERENCE_DATE}`
		);
	if (onlyExtract) return;
	const { token } = await seed(data);
	const kits = Object.values(data.kits).reduce((n, l) => n + l.length, 0);
	const origin = (process.env.AUTH_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
	console.info(
		`Seed completado: ${Object.keys(data.brands).length} marcas, ${data.restaurants.length} restaurantes, ` +
			`${data.campaigns.length} campañas, ${kits} kits, ${data.tickets.length} tickets, ${SEED_USERS.length} usuarios.\n` +
			`Invitación pendiente para ${SEED_INVITATION.email}:\n  ${origin}/invitacion/${token}`
	);
}

const isMain =
	process.argv[1] && resolve(process.argv[1]) === resolve('scripts/seed-from-prototype.ts');
if (isMain)
	main()
		.catch((e) => {
			console.error(e);
			process.exitCode = 1;
		})
		.finally(() => closeDb());
