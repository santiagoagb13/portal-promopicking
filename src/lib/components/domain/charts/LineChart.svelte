<!-- Línea de un valor por mes con su objetivo (OTIF). Geometría del servidor; sin JS. -->
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
			path: string;
			dots: { x: number; y: number; label: string; text: string }[];
			target: { y: number; label: string } | null;
			yTicks: { pos: number; label: string }[];
			xTicks: { pos: number; label: string }[];
		};
		label: string;
	};
	let { chart, label }: Props = $props();
	const f = $derived(chart.frame);
	const lastDot = $derived(chart.dots.at(-1));
</script>

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
	{#if chart.target}
		<line
			class="target"
			x1={f.left}
			x2={f.width - f.right}
			y1={chart.target.y}
			y2={chart.target.y}
		/>
		<text class="tick" x={f.width - f.right} y={chart.target.y - 4} text-anchor="end"
			>{chart.target.label}</text
		>
	{/if}
	<path class="line" d={chart.path} />
	{#each chart.dots as d (d.x)}
		<circle class="dot" cx={d.x} cy={d.y} r="4"><title>{d.label}: {d.text}</title></circle>
	{/each}
	{#if lastDot}
		<text class="value" x={lastDot.x} y={lastDot.y - 10} text-anchor="middle">{lastDot.text}</text>
	{/if}
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
	.target {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.line {
		fill: none;
		stroke: var(--series-1);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.dot {
		fill: var(--series-1);
		stroke: var(--surface);
		stroke-width: 2;
	}
	.tick {
		fill: var(--muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.value {
		fill: var(--ink);
		font-size: 12px;
		font-weight: 500;
	}
</style>
