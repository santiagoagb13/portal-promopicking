<!--
	Barra de progreso siempre neutra (7.5, regla 2): el semáforo es el único color de la fila.
	SVG en vez de `style="width"` para cumplir la CSP sin estilos en línea.
-->
<script lang="ts">
	let { value }: { value: number } = $props();
	const pct = $derived(Math.max(0, Math.min(100, Math.round(value))));
</script>

<span class="prog">
	<svg class="bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
		<rect class="track" width="100" height="6" />
		<rect class="fill" width={pct} height="6" />
	</svg>
	<span class="pct num">{pct} %</span>
</span>

<style>
	.prog {
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
	}
	.bar {
		width: 96px;
		max-width: 100%;
		height: 6px;
	}
	.track {
		fill: var(--line);
	}
	.fill {
		fill: var(--ink);
	}
	.pct {
		margin-left: 8px;
		color: var(--muted);
		font-size: 12px;
	}
	/* 7.5, regla 9: en móvil el progreso es solo texto. */
	@media (max-width: 767px) {
		.bar {
			display: none;
		}
		.pct {
			margin: 0;
			color: var(--ink);
			font-size: 13px;
		}
	}
</style>
