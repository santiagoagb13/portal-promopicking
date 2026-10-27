<!-- Hoja de QR para la imprenta: un código por versión y restaurante, imprimible o en CSV. -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Printer from '@lucide/svelte/icons/printer';
	import Download from '@lucide/svelte/icons/download';
	import Button from '$components/ui/Button.svelte';

	let { data } = $props();
</script>

<div class="bar no-print">
	<Button href="/qr" variant="ghost" icon={ChevronLeft} label="Volver a QR" />
	<b>{data.support.name} · {data.codes.length} códigos</b>
	<div class="spacer"></div>
	<Button href="/qr/soporte/{data.support.id}/csv" icon={Download}>CSV</Button>
	<Button variant="primary" icon={Printer} onclick={() => window.print()}>Imprimir</Button>
</div>
<div class="grid">
	{#each data.codes as c (c.code)}
		<figure class:retired={!!c.retiredAt}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<div class="qr">{@html c.svg}</div>
			<figcaption>
				<b class="mono">{c.code}</b>
				<span class="mono">{c.versionCode}</span>
				<span>{c.restaurantName ?? '—'}</span>
				{#if c.retiredAt}<span>Retirado</span>{/if}
			</figcaption>
		</figure>
	{/each}
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 16px;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 16px;
	}
	figure {
		margin: 0;
		padding: 10px;
		border: 1px solid var(--line);
		background: #fff;
		color: #000;
		display: grid;
		gap: 6px;
		break-inside: avoid;
	}
	.retired {
		opacity: 0.4;
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	figcaption {
		display: grid;
		font-size: 11px;
		gap: 2px;
	}
	.mono {
		font-family: var(--font-mono);
	}
	@media print {
		:global(.sb),
		:global(.topbar),
		:global(.tabbar),
		.no-print {
			display: none !important;
		}
		:global(.main) {
			margin: 0 !important;
		}
		.grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>
