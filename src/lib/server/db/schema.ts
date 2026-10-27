/**
 * Esquema de la base de datos (sección 6 del plan). Nombres en inglés; textos de interfaz en español.
 *
 * Las tablas `users`, `sessions`, `accounts`, `verifications` y `passkeys` las gestiona Better Auth:
 * sus propiedades JS (camelCase) son los nombres de campo que espera el adaptador de Drizzle.
 */
import { sql } from 'drizzle-orm';
import type { ImportDiff } from '../../domain/master';
import {
	bigint,
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	smallint,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

export const roleEnum = pgEnum('role', ['admin', 'ops', 'production', 'brand', 'manager']);
/** `deleted`: cuenta eliminada y anonimizada (la fila queda para que la auditoría no apunte a nadie identificable). */
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);

/* ---------- Acceso (Better Auth + invitaciones + auditoría) ---------- */

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	role: roleEnum('role').notNull(),
	status: userStatusEnum('status').notNull().default('active'),
	/** Organización a la que pertenece (Alsea, Promopicking, Albatros, restaurante). Solo informativo. */
	organization: text('organization'),
	createdAt: createdAt(),
	updatedAt: ts('updated_at').notNull().defaultNow(),
	lastSeenAt: ts('last_seen_at')
});

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		token: text('token').notNull().unique(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: ts('expires_at').notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

/** Better Auth la exige aunque no haya contraseñas ni proveedores externos (ver ADR 0002). */
export const accounts = pgTable('accounts', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: ts('access_token_expires_at'),
	refreshTokenExpiresAt: ts('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: createdAt(),
	updatedAt: ts('updated_at').notNull().defaultNow()
});

export const verifications = pgTable(
	'verifications',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: ts('expires_at').notNull(),
		createdAt: createdAt(),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [index('verifications_identifier_idx').on(t.identifier)]
);

export const passkeys = pgTable(
	'passkeys',
	{
		id: text('id').primaryKey(),
		name: text('name'),
		publicKey: text('public_key').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		credentialID: text('credential_id').notNull().unique(),
		counter: integer('counter').notNull(),
		deviceType: text('device_type').notNull(),
		backedUp: boolean('backed_up').notNull(),
		transports: text('transports'),
		aaguid: text('aaguid'),
		createdAt: createdAt(),
		/** Propio del portal (no de Better Auth): se actualiza al entrar con la passkey. */
		lastUsedAt: ts('last_used_at')
	},
	(t) => [index('passkeys_user_idx').on(t.userId)]
);

export const userBrands = pgTable(
	'user_brands',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		brandCode: text('brand_code')
			.notNull()
			.references(() => brands.code)
	},
	(t) => [primaryKey({ columns: [t.userId, t.brandCode] })]
);

export const userRestaurants = pgTable(
	'user_restaurants',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		restaurantId: text('restaurant_id')
			.notNull()
			.references(() => restaurants.id)
	},
	(t) => [primaryKey({ columns: [t.userId, t.restaurantId] })]
);

export type InvitationScope = { brands: string[]; restaurants: string[] };

export const invitations = pgTable(
	'invitations',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		/** Nombre propuesto por quien invita; la persona invitada lo confirma o corrige. */
		name: text('name'),
		role: roleEnum('role').notNull(),
		scope: jsonb('scope').$type<InvitationScope>().notNull(),
		/** SHA-256 del token; el token en claro solo viaja en el correo. */
		tokenHash: text('token_hash').notNull().unique(),
		invitedBy: text('invited_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		sentAt: ts('sent_at').notNull().defaultNow(),
		expiresAt: ts('expires_at').notNull(),
		usedAt: ts('used_at'),
		usedByUserId: text('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
		revokedAt: ts('revoked_at'),
		revokedBy: text('revoked_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => [index('invitations_email_idx').on(t.email)]
);

/** Registro inmutable: un disparador impide UPDATE y DELETE (migración 0001). Sin clave ajena a users. */
export const auditLog = pgTable(
	'audit_log',
	{
		id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
		at: ts('at').notNull().defaultNow(),
		userId: text('user_id'),
		action: text('action').notNull(),
		entity: text('entity'),
		entityId: text('entity_id'),
		before: jsonb('before'),
		after: jsonb('after'),
		ip: text('ip'),
		userAgent: text('user_agent')
	},
	(t) => [index('audit_log_user_at_idx').on(t.userId, t.at), index('audit_log_at_idx').on(t.at)]
);

/** Contadores de límite de intentos por ventana fija (acceso, invitación, enlace mágico). */
export const rateLimits = pgTable('rate_limits', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	resetAt: ts('reset_at').notNull()
});

/* ---------- Maestro ---------- */

export const brands = pgTable('brands', {
	code: text('code').primaryKey(),
	name: text('name').notNull(),
	short: text('short').notNull(),
	restaurantCount: integer('restaurant_count').notNull(),
	/** Prefijo de los códigos de campaña y de restaurante: FH, VI, GI. */
	idPrefix: text('id_prefix').notNull().default('')
});

export const restaurants = pgTable(
	'restaurants',
	{
		id: text('id').primaryKey(),
		brandCode: text('brand_code')
			.notNull()
			.references(() => brands.code),
		name: text('name').notNull(),
		city: text('city').notNull(),
		address: text('address').notNull(),
		tariff: text('tariff').notNull(),
		language: text('language').notNull(),
		assortment: text('assortment').notNull(),
		facade: text('facade'),
		deliveryPoint: text('delivery_point').notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: createdAt(),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
		updatedAt: ts('updated_at').notNull().defaultNow()
	},
	(t) => [index('restaurants_brand_idx').on(t.brandCode)]
);

/** Validación trimestral del maestro, por marca (8.10). */
export const masterValidations = pgTable(
	'master_validations',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		brandCode: text('brand_code')
			.notNull()
			.references(() => brands.code),
		validatedBy: text('validated_by').references(() => users.id, { onDelete: 'set null' }),
		validatedAt: ts('validated_at').notNull().defaultNow(),
		restaurantCount: integer('restaurant_count').notNull()
	},
	(t) => [index('master_validations_brand_idx').on(t.brandCode, t.validatedAt)]
);

/** Importación de Excel pendiente de confirmar: se guarda la previsualización (altas, cambios, bajas). */
export const masterImports = pgTable('master_imports', {
	id: text('id').primaryKey(),
	fileName: text('file_name').notNull(),
	brandCodes: jsonb('brand_codes').$type<string[]>().notNull(),
	diff: jsonb('diff').$type<ImportDiff>().notNull(),
	uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: createdAt(),
	appliedAt: ts('applied_at'),
	appliedBy: text('applied_by').references(() => users.id, { onDelete: 'set null' })
});

/** Ajustes del portal (8.12): plazos de las fases, objetivo OTIF… Un valor JSON por clave. */
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
	updatedAt: ts('updated_at').notNull().defaultNow()
});

/* ---------- Campañas ---------- */

export const campaigns = pgTable(
	'campaigns',
	{
		id: text('id').primaryKey(),
		brandCode: text('brand_code')
			.notNull()
			.references(() => brands.code),
		name: text('name').notNull(),
		inRestaurantOn: date('in_restaurant_on', { mode: 'string' }).notNull(),
		restaurantCount: integer('restaurant_count').notNull(),
		ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
		planned: boolean('planned').notNull().default(false),
		materials: text('materials'),
		notes: text('notes'),
		/** Campaña de la que se duplicó (plantilla). */
		templateOf: text('template_of'),
		createdAt: createdAt(),
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedAt: ts('updated_at').notNull().defaultNow(),
		updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
		archivedAt: ts('archived_at'),
		archivedBy: text('archived_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => [index('campaigns_brand_date_idx').on(t.brandCode, t.inRestaurantOn)]
);

export const milestoneKeyEnum = pgEnum('milestone_key', [
	'brief',
	'af',
	'aprob',
	'prod_ini',
	'prod_fin',
	'kitting',
	'exped',
	'plataforma',
	'rte'
]);

export const campaignMilestones = pgTable(
	'campaign_milestones',
	{
		campaignId: text('campaign_id')
			.notNull()
			.references(() => campaigns.id, { onDelete: 'cascade' }),
		key: milestoneKeyEnum('key').notNull(),
		dueOn: date('due_on', { mode: 'string' }).notNull(),
		doneAt: ts('done_at')
	},
	(t) => [primaryKey({ columns: [t.campaignId, t.key] })]
);

export const supports = pgTable(
	'supports',
	{
		id: text('id').primaryKey(),
		campaignId: text('campaign_id')
			.notNull()
			.references(() => campaigns.id, { onDelete: 'cascade' }),
		position: smallint('position').notNull().default(0),
		name: text('name').notNull(),
		versionsPlanned: integer('versions_planned').notNull().default(0),
		runQty: integer('run_qty').notNull().default(0),
		perKitQty: integer('per_kit_qty'),
		/** Texto libre de empaquetado tal como viene del pedido («Paq. 1.000 · entrega en Conway»). */
		packaging: text('packaging'),
		/** Fase del soporte, 0 (brief) a 6 (entregado). La fase de la campaña es la mínima. */
		stage: smallint('stage').notNull().default(0),
		responsible: text('responsible'),
		notes: text('notes'),
		artworkFormat: text('artwork_format'),
		artworkLabel: text('artwork_label'),
		artworkPrevLabel: text('artwork_prev_label')
	},
	(t) => [index('supports_campaign_idx').on(t.campaignId)]
);

export const versionStatusEnum = pgEnum('version_status', ['pending', 'approved', 'changes']);

export const supportVersions = pgTable(
	'support_versions',
	{
		id: text('id').primaryKey(),
		supportId: text('support_id')
			.notNull()
			.references(() => supports.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		tariff: text('tariff'),
		assortment: text('assortment'),
		language: text('language'),
		variant: text('variant'),
		kitsCount: integer('kits_count'),
		status: versionStatusEnum('status').notNull().default('pending'),
		revision: smallint('revision').notNull().default(1),
		fileKey: text('file_key'),
		fileSize: integer('file_size'),
		pageImages: jsonb('page_images').$type<PageImage[]>(),
		uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
		decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
		decidedAt: ts('decided_at'),
		prevVersionId: text('prev_version_id'),
		/** SHA-256 del PDF: identifica la revisión exacta que se aprobó. */
		fileHash: text('file_hash'),
		originalName: text('original_name'),
		uploadedAt: ts('uploaded_at'),
		/** Sustituida por una revisión posterior del mismo código. */
		supersededAt: ts('superseded_at')
	},
	(t) => [
		index('support_versions_support_status_idx').on(t.supportId, t.status),
		unique('support_versions_code_rev_uq').on(t.supportId, t.code, t.revision)
	]
);

/** Página del arte convertida a imagen (una entrada por página, varias anchuras). */
export type PageImage = {
	page: number;
	width: number;
	height: number;
	keys: Record<string, string>;
};

export const decisionEnum = pgEnum('version_decision', [
	'approved',
	'changes',
	'reopened',
	'undone'
]);

/** Historial de decisiones sobre cada versión: quién, cuándo, desde qué dispositivo y sobre qué fichero. */
export const versionDecisions = pgTable(
	'version_decisions',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		versionId: text('version_id')
			.notNull()
			.references(() => supportVersions.id, { onDelete: 'cascade' }),
		decision: decisionEnum('decision').notNull(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		userName: text('user_name'),
		at: ts('at').notNull().defaultNow(),
		comment: text('comment'),
		fileHash: text('file_hash'),
		revision: smallint('revision').notNull(),
		userAgent: text('user_agent')
	},
	(t) => [index('version_decisions_version_idx').on(t.versionId, t.at)]
);

/** Subida de artes finales en curso: ficheros subidos, pendientes de revisar el código y publicar. */
export const artworkUploads = pgTable('artwork_uploads', {
	id: text('id').primaryKey(),
	supportId: text('support_id')
		.notNull()
		.references(() => supports.id, { onDelete: 'cascade' }),
	uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: createdAt(),
	publishedAt: ts('published_at'),
	discardedAt: ts('discarded_at')
});

export const artworkUploadItems = pgTable(
	'artwork_upload_items',
	{
		id: text('id').primaryKey(),
		uploadId: text('upload_id')
			.notNull()
			.references(() => artworkUploads.id, { onDelete: 'cascade' }),
		originalName: text('original_name').notNull(),
		fileKey: text('file_key').notNull(),
		size: integer('size').notNull(),
		sha256: text('sha256'),
		detectedCode: text('detected_code'),
		registeredAt: ts('registered_at'),
		error: text('error')
	},
	(t) => [index('artwork_upload_items_upload_idx').on(t.uploadId)]
);

export const versionComments = pgTable(
	'version_comments',
	{
		id: text('id').primaryKey(),
		versionId: text('version_id')
			.notNull()
			.references(() => supportVersions.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		authorLabel: text('author_label'),
		at: ts('at').notNull().defaultNow(),
		text: text('text').notNull(),
		page: smallint('page'),
		x: real('x'),
		y: real('y')
	},
	(t) => [index('version_comments_version_idx').on(t.versionId)]
);

/* ---------- Kits y trazabilidad ---------- */

export const kits = pgTable(
	'kits',
	{
		id: text('id').primaryKey(),
		campaignId: text('campaign_id')
			.notNull()
			.references(() => campaigns.id, { onDelete: 'cascade' }),
		restaurantId: text('restaurant_id')
			.notNull()
			.references(() => restaurants.id),
		parcels: smallint('parcels').notNull().default(1),
		/** 0 preparado · 1 expedido · 2 en plataforma · 3 en reparto · 4 recibido */
		state: smallint('state').notNull().default(0),
		incidentTicketId: text('incident_ticket_id').references(() => tickets.id, {
			onDelete: 'set null'
		}),
		receivedBy: text('received_by'),
		receivedAt: ts('received_at')
	},
	(t) => [
		index('kits_campaign_state_idx').on(t.campaignId, t.state),
		index('kits_restaurant_idx').on(t.restaurantId),
		unique('kits_campaign_restaurant_uq').on(t.campaignId, t.restaurantId)
	]
);

export const kitLines = pgTable(
	'kit_lines',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		kitId: text('kit_id')
			.notNull()
			.references(() => kits.id, { onDelete: 'cascade' }),
		supportId: text('support_id').references(() => supports.id, { onDelete: 'set null' }),
		label: text('label').notNull(),
		versionCode: text('version_code').notNull(),
		qty: integer('qty').notNull()
	},
	(t) => [index('kit_lines_kit_idx').on(t.kitId)]
);

export const kitEventTypeEnum = pgEnum('kit_event_type', [
	'prepared',
	'shipped',
	'hub_in',
	'out_for_delivery',
	'received',
	'incident'
]);
export const eventSourceEnum = pgEnum('event_source', ['web', 'scanner', 'mobile', 'qr']);

export const kitEvents = pgTable(
	'kit_events',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		kitId: text('kit_id')
			.notNull()
			.references(() => kits.id, { onDelete: 'cascade' }),
		at: ts('at').notNull(),
		type: kitEventTypeEnum('type').notNull(),
		byUserId: text('by_user_id').references(() => users.id, { onDelete: 'set null' }),
		byLabel: text('by_label'),
		source: eventSourceEnum('source').notNull().default('web'),
		photoKey: text('photo_key')
	},
	(t) => [index('kit_events_kit_idx').on(t.kitId, t.at)]
);

export const qrCodes = pgTable('qr_codes', {
	code: text('code').primaryKey(),
	supportId: text('support_id')
		.notNull()
		.references(() => supports.id, { onDelete: 'cascade' }),
	versionCode: text('version_code').notNull(),
	batch: text('batch').notNull(),
	printedAt: ts('printed_at'),
	retiredAt: ts('retired_at')
});

/* ---------- Reposiciones ---------- */

export const catalogCategoryEnum = pgEnum('catalog_category', ['generic', 'lsm']);

export const catalogItems = pgTable('catalog_items', {
	id: text('id').primaryKey(),
	category: catalogCategoryEnum('category').notNull(),
	brandCode: text('brand_code').references(() => brands.code),
	name: text('name').notNull(),
	description: text('description').notNull(),
	unit: text('unit').notNull(),
	priceCents: integer('price_cents').notNull(),
	leadDays: smallint('lead_days').notNull(),
	active: boolean('active').notNull().default(true)
});

export const orderStateEnum = pgEnum('order_state', [
	'pending_validation',
	'preparing',
	'shipping',
	'delivered',
	'cancelled'
]);
export const orderSourceEnum = pgEnum('order_source', ['web', 'qr']);

export const orders = pgTable(
	'orders',
	{
		id: text('id').primaryKey(),
		restaurantId: text('restaurant_id')
			.notNull()
			.references(() => restaurants.id),
		placedBy: text('placed_by').references(() => users.id, { onDelete: 'set null' }),
		placedAt: ts('placed_at').notNull(),
		state: orderStateEnum('state').notNull(),
		source: orderSourceEnum('source').notNull().default('web'),
		validatedBy: text('validated_by').references(() => users.id, { onDelete: 'set null' })
	},
	(t) => [index('orders_restaurant_idx').on(t.restaurantId, t.placedAt)]
);

export const orderLines = pgTable(
	'order_lines',
	{
		orderId: text('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		itemId: text('item_id')
			.notNull()
			.references(() => catalogItems.id),
		qty: integer('qty').notNull(),
		unitPriceCents: integer('unit_price_cents').notNull()
	},
	(t) => [primaryKey({ columns: [t.orderId, t.itemId] })]
);

/* ---------- Soporte ---------- */

export const ticketTypeEnum = pgEnum('ticket_type', ['incident', 'query']);
export const ticketSeverityEnum = pgEnum('ticket_severity', ['low', 'medium', 'high']);
export const ticketStateEnum = pgEnum('ticket_state', [
	'open',
	'in_progress',
	'answered',
	'closed'
]);

export const tickets = pgTable(
	'tickets',
	{
		id: text('id').primaryKey(),
		campaignId: text('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
		restaurantId: text('restaurant_id').references(() => restaurants.id),
		type: ticketTypeEnum('type').notNull(),
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		severity: ticketSeverityEnum('severity').notNull().default('medium'),
		state: ticketStateEnum('state').notNull().default('open'),
		openedBy: text('opened_by').references(() => users.id, { onDelete: 'set null' }),
		openedByLabel: text('opened_by_label'),
		openedAt: ts('opened_at').notNull(),
		closedAt: ts('closed_at')
	},
	(t) => [
		index('tickets_state_opened_idx').on(t.state, t.openedAt),
		index('tickets_campaign_idx').on(t.campaignId)
	]
);

export const ticketUpdates = pgTable(
	'ticket_updates',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		ticketId: text('ticket_id')
			.notNull()
			.references(() => tickets.id, { onDelete: 'cascade' }),
		at: ts('at').notNull(),
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		authorLabel: text('author_label'),
		text: text('text').notNull(),
		photoKey: text('photo_key')
	},
	(t) => [index('ticket_updates_ticket_idx').on(t.ticketId, t.at)]
);

/* ---------- Notificaciones ---------- */

export const notifications = pgTable(
	'notifications',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		entity: text('entity'),
		entityId: text('entity_id'),
		href: text('href'),
		readAt: ts('read_at'),
		createdAt: createdAt()
	},
	(t) => [
		index('notifications_user_unread_idx')
			.on(t.userId, t.createdAt)
			.where(sql`${t.readAt} is null`)
	]
);

export type Role = (typeof roleEnum.enumValues)[number];
export type UserRow = typeof users.$inferSelect;
