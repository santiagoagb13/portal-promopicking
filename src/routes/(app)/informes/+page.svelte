<!--
	Informes (8.9): KPI, OTIF mensual con objetivo, consumo por marca, incidencias por tipo,
	aprobación por marca y tablas. Todo se dibuja en el servidor; los CSV y el PDF salen de los
	mismos datos que se ven aquí.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Download from '@lucide/svelte/icons/download';
	import FileText from '@lucide/svelte/icons/file-text';
	import Button from '$components/ui/Button.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import Donut from '$components/domain/charts/Donut.svelte';
	import HBars from '$components/domain/charts/HBars.svelte';
	import LineChart from '$components/domain/charts/LineChart.svelte';
	import StackedColumns from '$components/domain/charts/StackedColumns.svelte';
	import { money } from '$lib/domain/orders';
	import {
		BRAND_SLOT,
		PERIOD_LABEL,
		PERIODS,
		fmtDays,
		fmtInt,
		fmtPct,
		kpiCards,
		monthLabel
	} from '$lib/domain/reports';

	let { data } = $props();
	const r = $derived(data.report);
	const c = $derived(data.charts);

	function withParams(changes: Record<string, string | null>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		const s = p.toString();
		return s ? `?${s}` : '?';
	}
	const qs = $derived(page.url.search);
	const range = $derived(
		`${monthLabel(r.months[0]!, true)} – ${monthLabel(r.months.at(-1)!, true)}`
	);
	const maxSupport = $derived(Math.max(1, ...r.topSupports.map((s) => s.pieces)));
</script>

<div class="bar">
	{#if r.brands.length > 1}
		<Segmented
			label="Marca"
			items={[
				{ href: withParams({ marca: null }), label: 'Todas', active: !r.brand },
				...r.brands.map((b) => ({
					href: withParams({ marca: b.code }),
					label: b.short,
					active: r.brand === b.code
				}))
			]}
		/>
	{/if}
	<Segmented
		size="mini"
		label="Periodo"
		items={PERIODS.map((p) => ({
			href: withParams({ periodo: p === '12m' ? null : p }),
			label: PERIOD_LABEL[p],
			active: r.period === p
		}))}
	/>
	<div class="spacer"></div>
	<Button href="/informes/pdf{qs}" icon={FileText} data-sveltekit-reload>Informe PDF</Button>
</div>
<p class="range">
	{range}{#if r.liveFrom > r.months[0]! && r.liveFrom <= r.months.at(-1)!}. Hasta {monthLabel(
			r.histUntil!,
			true
		)}, histórico de seguimiento; desde {monthLabel(r.liveFrom, true)}, datos del portal (solo los
		restaurantes dados de alta en él){:else if r.liveFrom > r.months.at(-1)!}. Histórico de
		seguimiento{/if}.
</p>

<section class="kpis" aria-label="Indicadores">
	{#each kpiCards(r.kpis, r.otifTarget, r.period) as k (k.key)}
		<div class="kpi" data-kpi={k.key}>
			<span>{k.label}</span><b>{k.value}</b><small>{k.sub}</small>
		</div>
	{/each}
</section>

<div class="grid">
	<section class="card" aria-labelledby="otif-t">
		<header>
			<h2 id="otif-t">Entregas a tiempo por mes</h2>
			<a href="/informes/csv/otif{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		<p class="sub">% OTIF · objetivo {fmtPct(r.otifTarget, 0)}</p>
		<LineChart chart={c.otif} label="OTIF por mes, en porcentaje" />
	</section>
	<section class="card" aria-labelledby="consumo-t">
		<header>
			<h2 id="consumo-t">Consumo por marca</h2>
			<a href="/informes/csv/consumo{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		<p class="sub">piezas por mes</p>
		<StackedColumns
			chart={c.consumo}
			legend={r.byBrand.map((b) => ({ key: b.code, slot: BRAND_SLOT[b.code] ?? 5, name: b.name }))}
			label="Piezas entregadas por mes y marca"
			fmt={fmtInt}
		/>
	</section>
	<section class="card" aria-labelledby="inc-t">
		<header>
			<h2 id="inc-t">Incidencias por tipo</h2>
			<a href="/informes/csv/incidencias{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		{#if c.incidencias.total}
			<Donut chart={c.incidencias} label="Incidencias por tipo" center="incidencias" />
		{:else}
			<p class="sub">Sin incidencias en el periodo.</p>
		{/if}
	</section>
	<section class="card" aria-labelledby="apr-t">
		<header>
			<h2 id="apr-t">Tiempo medio de aprobación</h2>
			<a href="/informes/csv/aprobacion{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		<p class="sub">días laborables desde la subida del arte final hasta su aprobación</p>
		<HBars
			chart={c.aprobacion}
			width={260}
			label="Días medios de aprobación por marca"
			fmt={fmtDays}
		/>
	</section>
	<section class="card" aria-labelledby="rep-t">
		<header>
			<h2 id="rep-t">Reposiciones por restaurante</h2>
			<a href="/informes/csv/reposiciones{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		<p class="sub">top 5 · pedidos hechos en el portal</p>
		{#if r.topRestaurants.length}
			<table>
				<thead
					><tr><th>Restaurante</th><th class="r">Pedidos</th><th class="r">Importe</th></tr></thead
				>
				<tbody>
					{#each r.topRestaurants as t (t.id)}<tr
							><td>{t.name}</td><td class="r num">{t.orders}</td><td class="r num"
								>{money(t.cents)}</td
							></tr
						>{/each}
				</tbody>
			</table>
		{:else}
			<p class="sub">Sin pedidos en el periodo.</p>
		{/if}
	</section>
	<section class="card wide" aria-labelledby="sop-t">
		<header>
			<h2 id="sop-t">Soportes con mayor consumo</h2>
			<a href="/informes/csv/soportes{qs}" class="csv" download
				><Download size={14} aria-hidden="true" /> CSV</a
			>
		</header>
		<p class="sub">piezas según el brief de las campañas del periodo</p>
		{#if r.topSupports.length}
			<table>
				<thead
					><tr><th>Soporte</th><th>Marca</th><th class="r">Piezas</th><th class="w">Peso</th></tr
					></thead
				>
				<tbody>
					{#each r.topSupports as s, i (i)}
						<tr>
							<td>{s.name}</td>
							<td>{s.brandCode}</td>
							<td class="r num">{fmtInt(s.pieces)}</td>
							<td class="w"
								><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"
									><rect class="track" width="100" height="8" rx="2" /><rect
										class="fill"
										width={Math.max(1, (s.pieces / maxSupport) * 100)}
										height="8"
										rx="2"
									/></svg
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="sub">Sin campañas en el periodo.</p>
		{/if}
	</section>
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.spacer {
		flex: 1;
	}
	.range {
		font-size: 12px;
		color: var(--muted);
		margin: 8px 0 16px;
	}
	.kpis {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 16px;
	}
	.kpi {
		border: 1px solid var(--line);
		padding: 12px 14px;
		display: grid;
		gap: 4px;
	}
	.kpi span,
	.kpi small {
		font-size: 12px;
		color: var(--muted);
	}
	.kpi b {
		font-size: 22px;
		font-weight: 600;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.card {
		border: 1px solid var(--line);
		padding: 14px 16px;
		min-width: 0;
	}
	.wide {
		grid-column: 1 / -1;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 0;
	}
	.sub {
		font-size: 12px;
		color: var(--muted);
		margin: 2px 0 10px;
	}
	.csv {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		font-weight: 500;
		font-size: 12px;
		color: var(--muted);
		text-align: left;
		padding: 4px 6px 4px 0;
	}
	td {
		padding: 6px 6px 6px 0;
		border-top: 1px solid var(--line);
	}
	.r {
		text-align: right;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.w {
		width: 35%;
	}
	.w svg {
		width: 100%;
		height: 8px;
		display: block;
	}
	.track {
		fill: var(--line-soft);
	}
	.fill {
		fill: var(--series-1);
	}
	@media (max-width: 1023px) {
		.kpis {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
