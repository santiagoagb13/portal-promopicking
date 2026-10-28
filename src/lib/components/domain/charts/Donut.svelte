<!-- Anillo con su tabla (incidencias por tipo): la tabla lleva los valores, el color no es la única pista. -->
<script lang="ts">
	type Props = {
		chart: {
			size: number;
			total: number;
			arcs: { key: string; slot: number; value: number; share: number; d: string }[];
		};
		label: string;
		center: string;
	};
	let { chart, label, center }: Props = $props();
	const pct = (v: number) => `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
</script>

<div class="wrap">
	<svg
		viewBox="{-chart.size / 2} {-chart.size / 2} {chart.size} {chart.size}"
		role="img"
		aria-label={label}
	>
		{#each chart.arcs as a (a.key)}<path class="s{a.slot}" d={a.d}
				><title>{a.key}: {a.value} ({pct(a.share)})</title></path
			>{/each}
		<text class="total" text-anchor="middle" dominant-baseline="middle" y="-6">{chart.total}</text>
		<text class="sub" text-anchor="middle" dominant-baseline="middle" y="12">{center}</text>
	</svg>
	<table>
		<caption class="sr-only">{label}</caption>
		<thead><tr><th>Tipo</th><th class="r">N.º</th><th class="r">%</th></tr></thead>
		<tbody>
			{#each chart.arcs as a (a.key)}
				<tr
					><td><span class="sw s{a.slot}"></span>{a.key}</td><td class="r num">{a.value}</td><td
						class="r num">{pct(a.share)}</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr);
		gap: 16px;
		align-items: center;
	}
	svg {
		width: 140px;
		height: 140px;
	}
	.total {
		fill: var(--ink);
		font-size: 22px;
		font-weight: 600;
	}
	.sub {
		fill: var(--muted);
		font-size: 11px;
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
		padding: 4px 0;
	}
	td {
		padding: 4px 0;
		border-top: 1px solid var(--line);
	}
	.r {
		text-align: right;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.sw {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		margin-right: 8px;
	}
	.s1 {
		fill: var(--series-1);
		background: var(--series-1);
	}
	.s2 {
		fill: var(--series-2);
		background: var(--series-2);
	}
	.s3 {
		fill: var(--series-3);
		background: var(--series-3);
	}
	.s4 {
		fill: var(--series-4);
		background: var(--series-4);
	}
	.s5 {
		fill: var(--series-5);
		background: var(--series-5);
	}
	@media (max-width: 479px) {
		.wrap {
			grid-template-columns: minmax(0, 1fr);
			justify-items: center;
		}
	}
</style>
