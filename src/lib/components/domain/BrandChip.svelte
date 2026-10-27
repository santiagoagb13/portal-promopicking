<!-- Chip de marca neutro (7.5, regla 3): la marca se distingue por el texto, no por el color. -->
<script lang="ts">
	let { short }: { short: string } = $props();
</script>

<span class="bchip">{short}</span>

<style>
	.bchip {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 7px;
		border-radius: 2px;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.02em;
		background: var(--line-soft);
		color: var(--ink);
		white-space: nowrap;
	}
</style>
