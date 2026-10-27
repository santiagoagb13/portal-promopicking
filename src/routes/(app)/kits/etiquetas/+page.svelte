<!-- Etiquetas imprimibles A6 (@page). En pantalla se ven en rejilla; al imprimir, una por hoja. -->
<script lang="ts">
	import Printer from '@lucide/svelte/icons/printer';
	import Button from '$components/ui/Button.svelte';

	let { data } = $props();
</script>

<div class="no-print bar">
	<span>{data.labels.length} {data.labels.length === 1 ? 'etiqueta' : 'etiquetas'} A6</span>
	<Button variant="primary" icon={Printer} onclick={() => window.print()}>Imprimir</Button>
</div>

<div class="sheet">
	{#each data.labels as l (l.key)}
		<article class="label">
			<header>
				<b class="kit">{l.kit.id}</b>
				<span class="parcel">Bulto {l.n}/{l.kit.parcels}</span>
			</header>
			<div class="body">
				<div class="to">
					<small>Para</small>
					<b>{l.kit.restaurantName}</b>
					<span>{l.kit.address}</span>
					<small>{l.kit.deliveryPoint}</small>
				</div>
				<!-- SVG generado en el servidor por la librería qrcode a partir de la URL del kit (sin datos de usuario). -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="qr">{@html l.svg}</div>
			</div>
			<ul class="content">
				{#each l.kit.lines as line (line.id)}<li>
						<span>{line.label}</span><span class="mono">{line.versionCode}</span><span class="num"
							>{line.qty}</span
						>
					</li>{/each}
			</ul>
			<footer>{l.kit.campaignName} · {l.kit.campaignId} · {l.kit.brandShort}</footer>
		</article>
	{/each}
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 16px;
	}
	.sheet {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(105mm, 100%), 1fr));
		gap: 16px;
	}
	.label {
		background: #fff;
		color: #000;
		border: 1px solid #000;
		padding: 5mm;
		display: flex;
		flex-direction: column;
		gap: 3mm;
		aspect-ratio: 105 / 148;
		font-size: 9pt;
		overflow: hidden;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		border-bottom: 1px solid #000;
		padding-bottom: 2mm;
	}
	.kit,
	.mono {
		font-family: var(--font-mono);
	}
	.kit {
		font-size: 12pt;
	}
	.parcel {
		font-size: 14pt;
		font-weight: 600;
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 32mm;
		gap: 3mm;
	}
	.to {
		display: grid;
		gap: 1mm;
		align-content: start;
	}
	.to b {
		font-size: 13pt;
	}
	small {
		font-size: 7.5pt;
	}
	.qr :global(svg) {
		width: 32mm;
		height: 32mm;
		display: block;
	}
	.content {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid #000;
	}
	.content li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 10mm;
		gap: 2mm;
		padding: 1mm 0;
		border-bottom: 0.5px solid #999;
		font-size: 8pt;
	}
	.content .num {
		text-align: right;
	}
	footer {
		margin-top: auto;
		font-size: 7.5pt;
	}
	@media print {
		@page {
			size: A6;
			margin: 0;
		}
		:global(.sb),
		:global(.topbar),
		:global(.tabbar),
		.no-print {
			display: none !important;
		}
		:global(.main) {
			margin: 0 !important;
			padding: 0 !important;
		}
		:global(.content) {
			padding: 0 !important;
			max-width: none !important;
		}
		.sheet {
			display: block;
		}
		.label {
			width: 105mm;
			height: 148mm;
			aspect-ratio: auto;
			border: 0;
			break-after: page;
		}
	}
</style>
