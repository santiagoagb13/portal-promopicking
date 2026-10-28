<!-- Columnas apiladas por mes (consumo por marca), con leyenda. Geometría del servidor; sin JS. -->
<script lang="ts">
	type Props = {
		chart: {
			frame: {
				width: number;
				height: number;
				left: number;
				right: number;
				top: number;
				bottom: number;
			};
			columns: {
				label: string;
				total: number;
				segs: { key: string; slot: number; name: string; value: number; d: string }[];
			}[];
			yTicks: { pos: number; label: string }[];
			xTicks: { pos: number; label: string }[];
		};
		legend: { key: string; slot: number; name: string }[];
		label: string;
		fmt: (v: number) => string;
	};
	let { chart, legend, label, fmt }: Props = $props();
	const f = $derived(chart.frame);
</script>

{#if legend.length > 1}
	<ul class="legend">
		{#each legend as l (l.key)}<li><span class="sw s{l.slot}"></span>{l.name}</li>{/each}
	</ul>
{/if}
<svg viewBox="0 0 {f.width} {f.height}" role="img" aria-label={label}>
	{#each chart.yTicks as t (t.pos)}
		<line class="grid" x1={f.left} x2={f.width - f.right} y1={t.pos} y2={t.pos} />
		<text class="tick" x={f.left - 6} y={t.pos} text-anchor="end" dominant-baseline="middle"
			>{t.label}</text
		>
	{/each}
	{#each chart.xTicks as t (t.pos)}
		<text class="tick" x={t.pos} y={f.height - 6} text-anchor="middle">{t.label}</text>
	{/each}
	{#each chart.columns as c (c.label)}
		<g>
			<title>{c.label}: {c.segs.map((s) => `${s.name} ${fmt(s.value)}`).join(' · ')}</title>
			{#each c.segs as s (s.key)}<path class="s{s.slot}" d={s.d} />{/each}
		</g>
	{/each}
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 0 0 8px;
		padding: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 2px;
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
</style>
