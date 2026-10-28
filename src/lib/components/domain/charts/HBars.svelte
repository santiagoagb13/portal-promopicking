<!-- Barras horizontales con el valor en la punta (aprobación por marca). Una sola serie: sin leyenda. -->
<script lang="ts">
	type Props = {
		chart: {
			height: number;
			bars: {
				key: string;
				label: string;
				value: number | null;
				y: number;
				h: number;
				w: number;
				d: string;
			}[];
		};
		width: number;
		label: string;
		fmt: (v: number | null) => string;
	};
	let { chart, width, label, fmt }: Props = $props();
	const LABEL = 120;
</script>

<svg viewBox="0 0 {LABEL + width + 72} {chart.height}" role="img" aria-label={label}>
	{#each chart.bars as b (b.key)}
		<text class="name" x="0" y={b.y + b.h / 2} dominant-baseline="middle">{b.label}</text>
		<path class="bar" d={b.d} transform="translate({LABEL} 0)" />
		<text class="value" x={LABEL + b.w + 8} y={b.y + b.h / 2} dominant-baseline="middle"
			>{fmt(b.value)}</text
		>
	{/each}
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.bar {
		fill: var(--series-1);
	}
	.name {
		fill: var(--ink);
		font-size: 12px;
	}
	.value {
		fill: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
</style>
