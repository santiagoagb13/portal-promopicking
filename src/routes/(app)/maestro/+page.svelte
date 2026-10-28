<!-- Maestro de restaurantes (8.10). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import Upload from '@lucide/svelte/icons/upload';
	import Download from '@lucide/svelte/icons/download';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import Ban from '@lucide/svelte/icons/ban';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Store from '@lucide/svelte/icons/store';
	import Search from '@lucide/svelte/icons/search';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import Drawer from '$components/ui/Drawer.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import BrandChip from '$components/domain/BrandChip.svelte';
	import { MASTER_FIELDS, type MasterField } from '$lib/domain/master';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form: rawForm } = $props();
	type Values = Partial<Record<string, string | null>>;
	const form = $derived(
		rawForm as {
			save?: {
				error?: string;
				values?: Values;
				confirm?: { label: string; from: string | null; to: string }[];
			};
			create?: { error?: string; values?: Values };
			import?: { error?: string };
			validate?: { error?: string };
		} | null
	);
	type Row = (typeof data.rows)[number];

	let fichaDrawer: Drawer | undefined = $state();
	let newDrawer: Drawer | undefined = $state();
	let importDrawer: Drawer | undefined = $state();
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	const confirmar = $derived(page.url.searchParams.get('confirmar'));

	function withParams(changes: Record<string, string | null>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		// Tras un POST sin JS la URL lleva la acción (`/guardar`): no se arrastra a los enlaces.
		for (const k of [...p.keys()]) if (k.startsWith('/')) p.delete(k);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		const s = p.toString();
		return s ? `?${s}` : page.url.pathname;
	}

	/** Acción que conserva filtros y ficha abierta: sin JS (ADR 0011) el POST pinta esta misma vista. */
	function act(name: string) {
		const p = withParams({ confirmar: null });
		return p.startsWith('?') ? `${p}&/${name}` : `?/${name}`;
	}

	const brandItems = $derived([
		{ href: withParams({ marca: null, ficha: null }), label: 'Todas', active: !data.brand },
		...data.summary.map((b) => ({
			href: withParams({ marca: b.code, ficha: null }),
			label: b.short,
			active: data.brand === b.code
		}))
	]);

	const columns = [
		{ key: 'name', label: 'Restaurante', card: 'title' as const },
		{ key: 'brand', label: 'Marca', card: 'subtitle' as const },
		{ key: 'city', label: 'Ciudad' },
		{ key: 'tariff', label: 'Tarifa' },
		{ key: 'language', label: 'Idioma' },
		{ key: 'assortment', label: 'Surtido' },
		{ key: 'deliveryPoint', label: 'Entrega' },
		{ key: 'state', label: 'Estado', align: 'right' as const, card: 'aside' as const }
	];

	function optionsOf(brand: string, key: MasterField): string[] | null {
		if (key === 'deliveryPoint') return data.deliveryPoints;
		if (key === 'tariff' || key === 'language' || key === 'assortment')
			return data.closed[brand]?.[key] ?? [];
		return null;
	}

	const ficha = $derived(data.ficha);
	const saveValues = $derived<Values>(
		form?.save?.values ??
			(ficha ? Object.fromEntries(MASTER_FIELDS.map((f) => [f.key, ficha[f.key] ?? null])) : {})
	);
	let newBrand = $state('');

	$effect(() => {
		// La ficha se abre al llegar con ?ficha= (fila pulsada o enlace directo).
		if (ficha) fichaDrawer?.show();
	});

	const ACTION_LABEL: Record<string, string> = {
		'restaurant.updated': 'Cambios',
		'restaurant.created': 'Alta',
		'restaurant.deactivated': 'Baja',
		'restaurant.reactivated': 'Reactivado'
	};
	function describe(h: { before: unknown; after: unknown }) {
		const after = (h.after ?? {}) as Record<string, unknown>;
		const before = (h.before ?? {}) as Record<string, unknown>;
		return MASTER_FIELDS.filter((f) => f.key in after && f.key in before)
			.map((f) => `${f.label}: ${before[f.key] ?? '—'} → ${after[f.key] ?? '—'}`)
			.join(' · ');
	}
</script>

<section class="kpis" aria-label="Restaurantes por marca">
	{#each data.summary as b (b.code)}
		<div class="kpi">
			<div class="k-l">{b.name}</div>
			<div class="k-v num">{b.active}</div>
			<div class="k-s">
				{#if b.validatedAt}Validado el {fmtDateTime(b.validatedAt).slice(0, 10)}{:else}Sin validar
					este trimestre{/if}
				{#if b.canValidate}
					<Button
						href="?confirmar=validar-{b.code}"
						variant="green"
						size={32}
						icon={BadgeCheck}
						label="Validar el maestro de {b.short}"
						onclick={(e: MouseEvent) => {
							e.preventDefault();
							dialogs[`validar-${b.code}`]?.show();
						}}
					/>
					<ConfirmDialog
						bind:this={dialogs[`validar-${b.code}`]}
						id="validar-{b.code}"
						title="¿Validar el maestro de {b.short}?"
						description="Confirmas que los {b.active} restaurantes activos están al día. Queda registrado con tu nombre."
						confirmLabel="Validar"
						tone="green"
						action={act('validar')}
						fields={{ brand: b.code }}
						initiallyOpen={confirmar === `validar-${b.code}`}
					/>
				{/if}
			</div>
		</div>
	{/each}
</section>

<div class="page-h">
	{#if data.summary.length > 1}<Segmented label="Filtrar por marca" items={brandItems} />{/if}
	<form
		method="GET"
		class="search"
		role="search"
		data-sveltekit-replacestate
		data-sveltekit-noscroll
	>
		{#if data.brand}<input type="hidden" name="marca" value={data.brand} />{/if}
		{#if data.inactive}<input type="hidden" name="bajas" value="1" />{/if}
		<Search size={16} strokeWidth={1.5} aria-hidden="true" />
		<label class="sr-only" for="buscar-rte">Buscar restaurante</label>
		<input
			id="buscar-rte"
			name="q"
			type="search"
			placeholder="Código, nombre o ciudad"
			value={data.q}
		/>
	</form>
	<a
		class="toggle"
		class:on={data.inactive}
		href={withParams({ bajas: data.inactive ? null : '1' })}
		aria-current={data.inactive ? 'true' : undefined}
		data-sveltekit-noscroll>Incluir bajas</a
	>
	<div class="spacer"></div>
	<Button
		href="/maestro/exportar{data.brand ? `?marca=${data.brand}` : ''}"
		variant="ghost"
		icon={Download}
		label="Descargar Excel"
	/>
	{#if data.canImport}
		<Button
			href="?importar=1"
			variant="primary"
			icon={Upload}
			label="Importar Excel"
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				importDrawer?.show();
			}}
		/>
	{/if}
	{#if data.canCreate}
		<Button
			href="?alta=1"
			variant="primary"
			icon={Plus}
			label="Alta de restaurante"
			tipPos="left"
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				newDrawer?.show();
			}}
		/>
	{/if}
</div>
{#if form?.validate?.error}<p class="field-error" role="alert">{form.validate.error}</p>{/if}

{#if data.rows.length}
	<DataTable
		caption="Restaurantes"
		{columns}
		rows={data.rows}
		key={(r: Row) => r.id}
		dense
		rowHref={(r: Row) => withParams({ ficha: r.id })}
		mobilePage={20}
	>
		{#snippet cell(r: Row, col)}
			{#if col.key === 'name'}
				<a class="rname" href={withParams({ ficha: r.id })} data-sveltekit-noscroll>{r.name}</a
				><span class="id">{r.id}</span>
			{:else if col.key === 'brand'}
				<BrandChip short={data.summary.find((b) => b.code === r.brandCode)?.short ?? r.brandCode} />
			{:else if col.key === 'state'}
				{#if !r.active}<Chip tone="outline">Baja</Chip>{/if}
			{:else}
				<span class="cellv">{r[col.key as keyof Row] ?? '—'}</span>
			{/if}
		{/snippet}
	</DataTable>
{:else}
	<EmptyState
		icon={Store}
		text={data.q ? 'Ningún restaurante coincide.' : 'No hay restaurantes en tu ámbito.'}
	/>
{/if}

{#if ficha}
	<Drawer
		bind:this={fichaDrawer}
		id="ficha"
		title="{ficha.name} · {ficha.id}"
		initiallyOpen
		closeHref={withParams({ ficha: null })}
	>
		{#key ficha.id}
			<form
				method="POST"
				action={act('guardar')}
				class="form"
				use:enhance={() =>
					async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') fichaDrawer?.close();
					}}
			>
				<input type="hidden" name="id" value={ficha.id} />
				{#if form?.save?.confirm}<input type="hidden" name="confirmado" value="1" />{/if}
				{#each MASTER_FIELDS as f (f.key)}
					{@const options = optionsOf(ficha.brandCode, f.key)}
					{@const canEdit = data.editable.includes(f.key) && ficha.active}
					<label class="field">
						<span>{f.label}</span>
						{#if options}
							<select
								class="input"
								name={canEdit ? f.key : undefined}
								disabled={!canEdit}
								value={saveValues[f.key] ?? ''}
							>
								{#each options as o (o)}<option value={o}>{o}</option>{/each}
							</select>
						{:else}
							<input
								class="input"
								name={canEdit ? f.key : undefined}
								readonly={!canEdit}
								required={f.required}
								value={saveValues[f.key] ?? ''}
							/>
						{/if}
					</label>
				{/each}
				{#if form?.save?.confirm}
					<div class="confirm" role="alert">
						<b>Cambia la versión que recibe este restaurante:</b>
						<ul>
							{#each form.save.confirm as c (c.label)}<li>
									{c.label}: {c.from ?? '—'} → {c.to || '—'}
								</li>{/each}
						</ul>
					</div>
				{/if}
				{#if form?.save?.error}<p class="field-error" role="alert">{form.save.error}</p>{/if}
				<div class="actions">
					{#if data.canCreate}
						{#if ficha.active}
							<Button
								href="?ficha={ficha.id}&confirmar=baja"
								variant="red"
								icon={Ban}
								label="Dar de baja"
								onclick={(e: MouseEvent) => {
									e.preventDefault();
									dialogs['baja']?.show();
								}}
							/>
						{:else}
							<Button
								href="?ficha={ficha.id}&confirmar=reactivar"
								variant="amber"
								icon={RotateCcw}
								label="Reactivar"
								onclick={(e: MouseEvent) => {
									e.preventDefault();
									dialogs['reactivar']?.show();
								}}
							/>
						{/if}
					{/if}
					<span class="spacer"></span>
					<Button href={withParams({ ficha: null, confirmar: null })}>Cerrar</Button>
					{#if data.editable.length && ficha.active}
						<Button type="submit" variant="primary"
							>{form?.save?.confirm ? 'Guardar igualmente' : 'Guardar'}</Button
						>
					{/if}
				</div>
			</form>
			{#if ficha.history.length}
				<section class="history">
					<h3>Histórico</h3>
					<ul>
						{#each ficha.history as h, i (i)}
							<li>
								<small
									>{fmtDateTime(h.at)} · {h.userName ?? 'Sistema'} · {ACTION_LABEL[h.action] ??
										h.action}</small
								>
								{#if describe(h)}<p>{describe(h)}</p>{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/key}
	</Drawer>
	{#if data.canCreate}
		<ConfirmDialog
			bind:this={dialogs['baja']}
			id="baja"
			title="¿Dar de baja «{ficha.name}»?"
			description="Deja de recibir campañas y reposiciones. Se puede reactivar."
			confirmLabel="Dar de baja"
			tone="red"
			action={act('baja')}
			fields={{ id: ficha.id }}
			typeToConfirm={ficha.name}
			initiallyOpen={confirmar === 'baja'}
		/>
		<ConfirmDialog
			bind:this={dialogs['reactivar']}
			id="reactivar"
			title="¿Reactivar «{ficha.name}»?"
			confirmLabel="Reactivar"
			tone="amber"
			action={act('reactivar')}
			fields={{ id: ficha.id }}
			initiallyOpen={confirmar === 'reactivar'}
		/>
	{/if}
{/if}

{#if data.canCreate}
	<Drawer
		bind:this={newDrawer}
		id="alta"
		title="Alta de restaurante"
		initiallyOpen={data.openNew || !!form?.create}
		closeHref={withParams({ alta: null })}
	>
		<form method="POST" action={act('alta')} class="form" use:enhance>
			<div class="row2">
				<label class="field">
					<span>Marca</span>
					<select class="input" name="brandCode" required bind:value={newBrand}>
						<option value="" disabled>Elige</option>
						{#each data.summary as b (b.code)}<option value={b.code}>{b.short}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span>Código</span>
					<input
						class="input"
						name="id"
						required
						placeholder="{data.summary.find((b) => b.code === newBrand)?.prefix ?? 'FH'}-0000"
						value={form?.create?.values?.id ?? ''}
					/>
				</label>
			</div>
			{#each MASTER_FIELDS as f (f.key)}
				{@const options = newBrand ? optionsOf(newBrand, f.key) : null}
				<label class="field">
					<span>{f.label}</span>
					{#if options}
						<select class="input" name={f.key} required={f.required}>
							{#each options as o (o)}<option value={o}>{o}</option>{/each}
						</select>
					{:else}
						<input
							class="input"
							name={f.key}
							required={f.required}
							value={form?.create?.values?.[f.key] ?? ''}
						/>
					{/if}
				</label>
			{/each}
			{#if form?.create?.error}<p class="field-error" role="alert">{form.create.error}</p>{/if}
			<div class="actions">
				<Button href={withParams({ alta: null })}>Cancelar</Button>
				<Button type="submit" variant="primary">Dar de alta</Button>
			</div>
		</form>
	</Drawer>
{/if}

{#if data.canImport}
	<Drawer
		bind:this={importDrawer}
		id="importar"
		title="Importar Excel"
		initiallyOpen={data.openImport || !!form?.import}
		closeHref={withParams({ importar: null })}
	>
		<form
			method="POST"
			action={act('importar')}
			enctype="multipart/form-data"
			class="form"
			use:enhance
		>
			<p class="hint">
				Un .xlsx o .csv con las columnas de la descarga: Código, Marca, Nombre, Ciudad, Dirección,
				Tarifa, Idioma, Surtido, Fachada y Entrega. Antes de aplicar nada verás las altas, los
				cambios y las bajas.
			</p>
			<label class="field"
				><span>Fichero</span><input
					class="input file"
					type="file"
					name="fichero"
					required
					accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				/></label
			>
			{#if form?.import?.error}<p class="field-error" role="alert">{form.import.error}</p>{/if}
			<div class="actions">
				<Button href={withParams({ importar: null })}>Cancelar</Button>
				<Button type="submit" variant="primary" icon={Upload}>Previsualizar</Button>
			</div>
		</form>
	</Drawer>
{/if}

<style>
	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		margin-bottom: 16px;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.kpi {
		padding: 16px 24px;
		border-left: 1px solid var(--line);
		min-width: 0;
	}
	.kpi:first-child {
		border-left: 0;
		padding-left: 0;
	}
	.k-l,
	.k-s {
		font-size: 12px;
		color: var(--muted);
	}
	.k-s {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
		min-height: 32px;
	}
	.k-v {
		font-size: 32px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.page-h {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding-bottom: 16px;
	}
	.spacer {
		flex: 1;
	}
	.search {
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		color: var(--muted);
		width: 240px;
		max-width: 100%;
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		color: var(--ink);
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.toggle {
		height: 36px;
		display: inline-flex;
		align-items: center;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 2px;
		font-size: 13px;
		color: var(--muted);
	}
	.toggle.on {
		background: var(--seg-on);
		color: var(--seg-on-ink);
	}
	.rname {
		font-weight: 500;
	}
	.id {
		display: block;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
	}
	.cellv {
		white-space: nowrap;
	}
	.confirm {
		padding: 10px 12px;
		border-left: 2px solid var(--amber);
		background: var(--amber-bg);
		color: var(--amber-ink);
		font-size: 13px;
	}
	.confirm ul {
		margin: 6px 0 0;
		padding-left: 18px;
	}
	.history {
		margin-top: 32px;
		border-top: 1px solid var(--line);
		padding-top: 16px;
	}
	.history h3 {
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 8px;
	}
	.history ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.history small {
		color: var(--muted);
		font-size: 12px;
	}
	.history p {
		font-size: 13px;
		margin-top: 2px;
	}
	.hint {
		font-size: 13px;
		color: var(--muted);
	}
	.file {
		padding: 8px;
		height: auto;
	}
	@media (max-width: 767px) {
		.kpi {
			padding: 12px 16px;
		}
		.kpi:nth-child(odd) {
			border-left: 0;
			padding-left: 0;
		}
		.search {
			width: 100%;
			order: 10;
		}
	}
</style>
