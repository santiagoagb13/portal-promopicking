<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Table from '@lucide/svelte/icons/table';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type DrawerT from '$components/ui/Drawer.svelte';
	import type CampaignFormT from '$components/domain/CampaignForm.svelte';
	import { STAGES } from '$lib/domain/campaign';
	import { monthLabel, shiftMonth } from '$lib/domain/calendar';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import BrandChip from '$components/domain/BrandChip.svelte';
	import ProgressBar from '$components/domain/ProgressBar.svelte';
	import Semaphore from '$components/domain/Semaphore.svelte';
	import { fmtDay, fmtDayShort, relDays } from '$lib/domain/dates';
	import { page } from '$app/state';

	let { data } = $props();
	type Row = (typeof data.rows)[number];

	/*
	 * El alta va en un panel lateral que solo se descarga al pulsar «Nueva campaña» (presupuesto
	 * de JS, 9.2). Sin JS el mismo botón lleva a la página /campanas/nueva.
	 */
	type Loaded = { Drawer: typeof DrawerT; Form: typeof CampaignFormT };
	let createUi = $state<Loaded | null>(null);
	let drawer: DrawerT | undefined = $state();
	async function openNew(e: MouseEvent) {
		e.preventDefault();
		if (!createUi) {
			const [d, f] = await Promise.all([
				import('$components/ui/Drawer.svelte'),
				import('$components/domain/CampaignForm.svelte')
			]);
			createUi = { Drawer: d.default, Form: f.default };
		}
		requestAnimationFrame(() => drawer?.show());
	}

	const viewItems = $derived([
		{
			href: withParams({ vista: null, mes: null }),
			label: 'Tabla',
			active: data.view === 'tabla',
			icon: Table
		},
		{
			href: withParams({ vista: 'calendario' }),
			label: 'Calendario',
			active: data.view === 'calendario',
			icon: CalendarDays
		}
	]);
	const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
	const phaseValue = $derived(data.phase === null ? '' : String(data.phase));

	/** URL de la página con un parámetro cambiado (los filtros viven en la URL). */
	function withParams(changes: Record<string, string | null>) {
		// Copia local para construir un enlace: no es estado reactivo.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		p.delete('todas');
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		const s = p.toString();
		return s ? `?${s}` : page.url.pathname;
	}

	const brandItems = $derived([
		{ href: withParams({ marca: null }), label: 'Todas', active: !data.brand },
		...data.brands.map((b) => ({
			href: withParams({ marca: b.code }),
			label: b.label,
			active: data.brand === b.code
		}))
	]);

	function sortFor(key: 'fecha' | 'semaforo') {
		const active = data.order === key;
		const dir: 'ascending' | 'descending' | 'none' = active
			? data.desc
				? 'descending'
				: 'ascending'
			: 'none';
		const nextDesc = active && !data.desc;
		return {
			href: withParams({ orden: key === 'fecha' ? null : key, dir: nextDesc ? 'desc' : null }),
			dir
		};
	}

	const columns = $derived([
		{ key: 'name', label: 'Campaña', card: 'title' as const },
		{ key: 'brand', label: 'Marca', card: 'subtitle' as const },
		{ key: 'date', label: 'En restaurante', sort: sortFor('fecha') },
		{ key: 'rtes', label: 'Restaurantes', align: 'right' as const },
		{ key: 'stage', label: 'Fase' },
		{ key: 'progress', label: 'Progreso' },
		{
			key: 'sem',
			label: 'Semáforo',
			align: 'center' as const,
			card: 'aside' as const,
			sort: sortFor('semaforo')
		}
	]);
</script>

<div class="page-h">
	{#if data.brands.length > 1}
		<Segmented label="Filtrar por marca" items={brandItems} />
	{/if}
	{#if data.q}
		<Chip tone="outline"
			>«{data.q}»
			<a class="clear" href={withParams({ q: null })} aria-label="Quitar búsqueda">×</a></Chip
		>
	{/if}
	<form method="GET" class="phase" data-sveltekit-replacestate data-sveltekit-noscroll>
		{#each [...page.url.searchParams].filter(([k]) => k !== 'fase' && k !== 'todas') as [k, v] (k)}
			<input type="hidden" name={k} value={v} />
		{/each}
		<label class="sr-only" for="fase">Fase</label>
		<select
			id="fase"
			name="fase"
			class="sel"
			value={phaseValue}
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">Todas las fases</option>
			{#each STAGES as s, i (s)}<option value={String(i)}>{s}</option>{/each}
			<option value="planificada">Planificada</option>
		</select>
		<noscript><Button type="submit" size={32}>Filtrar</Button></noscript>
	</form>
	<div class="spacer"></div>
	<span class="views"><Segmented label="Vista" items={viewItems} /></span>
	{#if data.canCreate}
		<Button
			href="/campanas/nueva"
			variant="primary"
			icon={Plus}
			label="Nueva campaña"
			tipPos="left"
			onclick={openNew}
		/>
	{/if}
</div>

<section class="kpis" aria-label="Indicadores">
	<div class="kpi">
		<div class="k-l">Campañas activas</div>
		<div class="k-v num">{data.kpis.active}</div>
		<div class="k-s">de {data.kpis.total} en el calendario</div>
	</div>
	<div class="kpi">
		<div class="k-l">Versiones pendientes</div>
		<div class="k-v num">{data.kpis.pending}</div>
		<div class="k-s">
			{#if data.canSeeApprovals}<a href="/aprobaciones">Aprobación de artes</a>{:else}&nbsp;{/if}
		</div>
	</div>
	<div class="kpi">
		<div class="k-l">Incidencias abiertas</div>
		<div class="k-v num">{data.kpis.incidents}</div>
		<div class="k-s"><a href="/soporte">Soporte</a></div>
	</div>
	<div class="kpi">
		<div class="k-l">Próxima entrega</div>
		<div class="k-v num">{data.kpis.next ? fmtDayShort(data.kpis.next.on) : '—'}</div>
		<div class="k-s">
			{#if data.kpis.next}{data.kpis.next.name} · {relDays(
					data.kpis.next.on,
					data.today
				)}{:else}&nbsp;{/if}
		</div>
	</div>
</section>

{#if data.view === 'calendario' && data.calendar}
	{@const cal = data.calendar}
	<section class="cal" aria-label="Calendario de hitos">
		<div class="cal-h">
			<Button
				href={withParams({ mes: shiftMonth(cal.month, -1) })}
				variant="ghost"
				icon={ChevronLeft}
				label="Mes anterior"
			/>
			<h2>{monthLabel(cal.month)}</h2>
			<Button
				href={withParams({ mes: shiftMonth(cal.month, 1) })}
				variant="ghost"
				icon={ChevronRight}
				label="Mes siguiente"
			/>
		</div>
		<div class="grid" role="list">
			{#each WEEKDAYS as w (w)}<div class="wd" aria-hidden="true">{w}</div>{/each}
			{#each cal.days as d (d.day)}
				<div
					class="day"
					class:out={!d.inMonth}
					class:today={d.day === data.today}
					class:empty={!d.items.length}
					role="listitem"
				>
					<span class="dn num">{fmtDay(d.day).slice(0, 5)}</span>
					<ul>
						{#each d.items as it (it.campaignId + it.key)}
							<li class:done={it.done}>
								<a href="/campanas/{it.campaignId}" title="{it.name} · {it.label}">
									<b>{it.brandShort}</b>
									{it.name}<span>{it.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
{:else if data.rows.length}
	<DataTable
		caption="Campañas"
		{columns}
		rows={data.rows}
		key={(r: Row) => r.id}
		rowHref={(r: Row) => `/campanas/${r.id}`}
		moreHref={withParams({ todas: '1' })}
		expanded={data.expanded}
	>
		{#snippet cell(r: Row, col)}
			{#if col.key === 'name'}
				<a class="c-name" href="/campanas/{r.id}">{r.name}</a><span class="id">{r.id}</span>
			{:else if col.key === 'brand'}
				<BrandChip short={r.brandShort} />
			{:else if col.key === 'date'}
				<span class="num">{fmtDay(r.inRestaurantOn)}</span><span class="sub"
					>{relDays(r.inRestaurantOn, data.today)}</span
				>
			{:else if col.key === 'rtes'}
				<span class="num">{r.restaurantCount}</span>
			{:else if col.key === 'stage'}
				<Chip tone={r.stageTone}>{r.stageLabel}</Chip>
			{:else if col.key === 'progress'}
				<ProgressBar value={r.progress} />
			{:else if col.key === 'sem'}
				<Semaphore value={r.semaphore} />
			{/if}
		{/snippet}
	</DataTable>
{:else}
	<EmptyState
		icon={Megaphone}
		text={data.q ? 'Ninguna campaña coincide con la búsqueda.' : 'No hay campañas en tu ámbito.'}
	/>
{/if}

{#if createUi}
	<createUi.Drawer bind:this={drawer} id="nueva-campana" title="Nueva campaña">
		<createUi.Form
			action="/campanas/nueva?/crear"
			brands={data.brand ? data.brands.filter((b) => b.code === data.brand) : data.brands}
			owners={data.owners}
			onclose={() => drawer?.close()}
		/>
	</createUi.Drawer>
{/if}

<style>
	.phase {
		display: inline-flex;
		gap: 8px;
	}
	.sel {
		height: 36px;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		font: inherit;
		color: var(--ink);
	}
	.cal-h {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.cal-h h2 {
		min-width: 160px;
		text-align: center;
		text-transform: capitalize;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		border-top: 1px solid var(--line);
		border-left: 1px solid var(--line);
	}
	.wd {
		padding: 6px 8px;
		font-size: 12px;
		color: var(--muted);
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.day {
		min-height: 104px;
		min-width: 0;
		padding: 6px;
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.day.out {
		background: var(--line-soft);
	}
	.day.out .dn {
		color: var(--muted);
	}
	.day.today .dn {
		background: var(--ink);
		color: var(--bg);
		padding: 0 4px;
	}
	.dn {
		font-size: 12px;
		display: inline-block;
		margin-bottom: 4px;
	}
	.day ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
		min-width: 0;
	}
	.day li {
		min-width: 0;
	}
	.day a {
		display: block;
		font-size: 11px;
		line-height: 1.3;
		padding: 2px 4px;
		border-left: 2px solid var(--ink);
		background: var(--surface);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.day a:hover {
		background: var(--line-soft);
	}
	.day a b {
		font-weight: 600;
	}
	.day a span {
		display: block;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.day li.done a {
		border-left-color: var(--line);
		color: var(--muted);
	}
	/* Móvil: agenda (solo los días con hitos), sin rejilla de 7 columnas. */
	@media (max-width: 767px) {
		.views {
			display: none;
		}
		.grid {
			grid-template-columns: 1fr;
			border-left: 0;
		}
		.wd,
		.day.empty,
		.day.out {
			display: none;
		}
		.day {
			min-height: 0;
			border-right: 0;
			display: grid;
			grid-template-columns: 56px minmax(0, 1fr);
			gap: 8px;
			padding: 8px 0;
		}
		.day a {
			font-size: 13px;
			padding: 4px 8px;
			white-space: normal;
		}
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
	.clear {
		margin-left: 6px;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		margin-bottom: 16px;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.kpi {
		min-width: 0;
		padding: 16px 24px;
		border-left: 1px solid var(--line);
	}
	.kpi:first-child {
		border-left: 0;
		padding-left: 0;
	}
	.k-l,
	.k-s {
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.k-l {
		margin-bottom: 4px;
	}
	.k-s {
		margin-top: 4px;
	}
	.k-s a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.k-v {
		font-size: 32px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.c-name {
		font-weight: 500;
	}
	.id {
		display: block;
		color: var(--muted);
	}
	.sub {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	@media (max-width: 1023px) {
		.sub {
			display: inline;
			margin-left: 6px;
		}
	}
	@media (max-width: 767px) {
		.kpis {
			grid-template-columns: 1fr 1fr;
		}
		.kpi {
			padding: 12px 16px;
		}
		.kpi:nth-child(odd) {
			border-left: 0;
			padding-left: 0;
		}
		.kpi:nth-child(n + 3) {
			border-top: 1px solid var(--line);
		}
		.k-v {
			font-size: 24px;
		}
	}
</style>
