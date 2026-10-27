<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
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

	/** URL de la página con un parámetro cambiado (los filtros viven en la URL). */
	function withParams(changes: Record<string, string | null>) {
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
		...data.brands.map((b) => ({ href: withParams({ marca: b.code }), label: b.label, active: data.brand === b.code }))
	]);

	function sortFor(key: 'fecha' | 'semaforo') {
		const active = data.order === key;
		const dir: 'ascending' | 'descending' | 'none' = active ? (data.desc ? 'descending' : 'ascending') : 'none';
		const nextDesc = active && !data.desc;
		return { href: withParams({ orden: key === 'fecha' ? null : key, dir: nextDesc ? 'desc' : null }), dir };
	}

	const columns = $derived([
		{ key: 'name', label: 'Campaña', card: 'title' as const },
		{ key: 'brand', label: 'Marca', card: 'subtitle' as const },
		{ key: 'date', label: 'En restaurante', sort: sortFor('fecha') },
		{ key: 'rtes', label: 'Restaurantes', align: 'right' as const },
		{ key: 'stage', label: 'Fase' },
		{ key: 'progress', label: 'Progreso' },
		{ key: 'sem', label: 'Semáforo', align: 'center' as const, card: 'aside' as const, sort: sortFor('semaforo') }
	]);
</script>

<div class="page-h">
	{#if data.brands.length > 1}
		<Segmented label="Filtrar por marca" items={brandItems} />
	{/if}
	{#if data.q}
		<Chip tone="outline">«{data.q}» <a class="clear" href={withParams({ q: null })} aria-label="Quitar búsqueda">×</a></Chip>
	{/if}
	<div class="spacer"></div>
	{#if data.canCreate}
		<Button href="/campanas/nueva" variant="primary" icon={Plus} label="Nueva campaña" tipPos="left" />
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
			{#if data.kpis.next}{data.kpis.next.name} · {relDays(data.kpis.next.on, data.today)}{:else}&nbsp;{/if}
		</div>
	</div>
</section>

{#if data.rows.length}
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
				<span class="num">{fmtDay(r.inRestaurantOn)}</span><span class="sub">{relDays(r.inRestaurantOn, data.today)}</span>
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
	<EmptyState icon={Megaphone} text={data.q ? 'Ninguna campaña coincide con la búsqueda.' : 'No hay campañas en tu ámbito.'} />
{/if}

<style>
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
