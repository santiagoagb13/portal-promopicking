<!-- Kits y etiquetas (8.6): campaña, resumen por estado, kits con su acción siguiente e impresión de etiquetas. -->
<script lang="ts">
	import { page } from '$app/state';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import Printer from '@lucide/svelte/icons/printer';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import Package from '@lucide/svelte/icons/package';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import { EVENT_LABEL, KIT_STATES, KIT_TONE, STEP_LABEL } from '$lib/domain/kits';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form } = $props();
	type Row = (typeof data.rows)[number];
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	let selected = $state<string[]>([]);

	function href(changes: Record<string, string | null>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		const s = p.toString();
		return s ? `?${s}` : page.url.pathname;
	}

	const stateItems = $derived([
		{
			href: href({ estado: null }),
			label: 'Todos',
			active: data.state === null,
			count: data.summary.reduce((a, b) => a + b, 0)
		},
		...KIT_STATES.map((label, i) => ({
			href: href({ estado: String(i) }),
			label,
			active: data.state === i,
			count: data.summary[i]
		}))
	]);
	const columns = [
		{ key: 'sel', label: 'Elegir' },
		{ key: 'kit', label: 'Kit', card: 'title' as const },
		{ key: 'rte', label: 'Restaurante', card: 'subtitle' as const },
		{ key: 'parcels', label: 'Bultos', align: 'right' as const },
		{ key: 'state', label: 'Estado' },
		{ key: 'last', label: 'Último evento' },
		{ key: 'acts', label: 'Acción', align: 'right' as const, card: 'aside' as const }
	];
	const canScan = (step: string | null) => !!step && data.scanSteps.includes(step as never);
</script>

<div class="page-h">
	<form method="GET" class="pick" data-sveltekit-replacestate>
		<label class="sr-only" for="campana">Campaña</label>
		<select
			id="campana"
			name="campana"
			class="sel"
			value={data.campaign?.id ?? ''}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			{#each data.campaigns as c (c.id)}<option value={c.id}
					>{c.id} · {c.name}{c.kits ? ` · ${c.kits} kits` : ''}</option
				>{/each}
		</select>
		<noscript><Button type="submit" size={32}>Ver</Button></noscript>
	</form>
	<div class="spacer"></div>
	{#if data.scanSteps.length}<Button href="/kits/escaneo" variant="primary" icon={ScanLine}
			>Escanear</Button
		>{/if}
	<Button
		type="submit"
		form="etiquetas"
		icon={Printer}
		label="Imprimir etiquetas de los elegidos"
		tipPos="left"
		disabled={!selected.length}
	/>
</div>

{#if data.campaign}
	{#if data.campaign.kits}
		<div class="states">
			<Segmented size="mini" label="Filtrar por estado" items={stateItems} />
		</div>
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		<form id="etiquetas" method="GET" action="/kits/etiquetas" target="_blank"></form>
		<DataTable
			caption="Kits"
			{columns}
			rows={data.rows}
			key={(r: Row) => r.id}
			dense
			mobilePage={20}
			rowHref={(r: Row) => `/kits/${r.id}`}
		>
			{#snippet cell(r: Row, col)}
				{#if col.key === 'sel'}
					<input
						type="checkbox"
						form="etiquetas"
						name="kit"
						value={r.id}
						aria-label="Elegir {r.id}"
						bind:group={selected}
					/>
				{:else if col.key === 'kit'}
					<a class="mono" href="/kits/{r.id}">{r.id}</a>
				{:else if col.key === 'rte'}
					{r.restaurantName} <span class="muted">· {r.city}</span>
				{:else if col.key === 'parcels'}
					<span class="num">{r.parcels}</span>
				{:else if col.key === 'state'}
					<Chip tone={KIT_TONE[r.state]}>{KIT_STATES[r.state]}</Chip
					>{#if r.incidentTicketId}&nbsp;<Chip tone="red">{r.incidentTicketId}</Chip>{/if}
				{:else if col.key === 'last'}
					<small
						>{r.lastType ? EVENT_LABEL[r.lastType] : '—'}{r.lastAt
							? ` · ${fmtDateTime(r.lastAt)}`
							: ''}</small
					>
				{:else if col.key === 'acts' && r.next && canScan(r.next)}
					<Button
						href="?confirmar={r.id}"
						variant="primary"
						icon={ScanLine}
						label={STEP_LABEL[r.next]}
						tipPos="left"
						onclick={(e: MouseEvent) => {
							e.preventDefault();
							dialogs[r.id]?.show();
						}}
					/>
					<ConfirmDialog
						bind:this={dialogs[r.id]}
						id="reg-{r.id}"
						title="¿Registrar {STEP_LABEL[r.next].toLowerCase()} de {r.id}?"
						description="{r.restaurantName} · queda con tu nombre y la hora de ahora."
						confirmLabel="Registrar"
						action="?/registrar"
						fields={{ kit: r.id, paso: r.next }}
						initiallyOpen={confirmar === r.id}
					/>
				{/if}
			{/snippet}
		</DataTable>
	{:else}
		<EmptyState icon={Package} text="Esta campaña aún no tiene kits.">
			{#if data.canGenerate}
				<Button
					href="?campana={data.campaign.id}&confirmar=generar"
					variant="primary"
					icon={PackagePlus}
					onclick={(e: MouseEvent) => {
						e.preventDefault();
						dialogs['generar']?.show();
					}}>Generar kits</Button
				>
			{/if}
		</EmptyState>
		{#if data.canGenerate}
			<ConfirmDialog
				bind:this={dialogs['generar']}
				id="generar"
				title="¿Generar los kits de {data.campaign.id}?"
				description="Uno por restaurante activo de la marca, con la versión de cada soporte según su tarifa, surtido e idioma."
				confirmLabel="Generar kits"
				action="?/generar"
				fields={{ campana: data.campaign.id }}
				initiallyOpen={confirmar === 'generar'}
			/>
		{/if}
	{/if}
{:else}
	<EmptyState icon={Package} text="No hay campañas con kits en tu ámbito." />
{/if}

<style>
	.page-h {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding-bottom: 12px;
	}
	.spacer {
		flex: 1;
	}
	.pick {
		display: flex;
		gap: 8px;
		min-width: 0;
		max-width: 100%;
	}
	.sel {
		height: 36px;
		max-width: 100%;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		font: inherit;
		color: var(--ink);
	}
	.states {
		padding-bottom: 12px;
		overflow-x: auto;
		max-width: 100%;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 500;
	}
	.muted,
	small {
		color: var(--muted);
		font-size: 12px;
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
	}
</style>
