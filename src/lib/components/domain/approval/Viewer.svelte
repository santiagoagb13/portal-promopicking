<!--
	Visor de artes (8.5): la página como imagen (srcset), zoom, comparación con la revisión anterior
	lado a lado y comentarios anclados a un punto. Los puntos van en un SVG superpuesto con el
	tamaño de la imagen, no con estilos en línea (CSP).
-->
<script lang="ts">
	type Page = { page: number; width: number; height: number; src: string; srcset: string };
	type Pin = { n: number; page: number | null; x: number | null; y: number | null; author: string };
	type Props = {
		code: string;
		pages: Page[];
		prev: { revision: number; pages: Page[] } | null;
		revision: number;
		current: number;
		faceName: string;
		compare: boolean;
		zoom: 100 | 150 | 200;
		pins: Pin[];
		anchorMode: boolean;
		anchor: { page: number; x: number; y: number } | null;
		onanchor: (a: { page: number; x: number; y: number }) => void;
	};
	let {
		code,
		pages,
		prev,
		revision,
		current,
		faceName,
		compare,
		zoom,
		pins,
		anchorMode,
		anchor,
		onanchor
	}: Props = $props();

	const page = $derived(pages.find((p) => p.page === current) ?? pages[0]);
	const prevPage = $derived(prev?.pages.find((p) => p.page === current) ?? prev?.pages[0]);
	const pagePins = $derived(pins.filter((p) => p.page === current && p.x !== null && p.y !== null));

	function place(e: MouseEvent) {
		if (!anchorMode || !page) return;
		const img = (e.currentTarget as HTMLElement).querySelector('img')!;
		const r = img.getBoundingClientRect();
		const x = (e.clientX - r.left) / r.width;
		const y = (e.clientY - r.top) / r.height;
		if (x < 0 || x > 1 || y < 0 || y > 1) return;
		onanchor({ page: page.page, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
	}
</script>

{#snippet figure(p: Page, label: string, withPins: boolean)}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<figure
		class="page"
		class:anchoring={withPins && anchorMode}
		onclick={withPins ? place : undefined}
	>
		<img
			src={p.src}
			srcset={p.srcset}
			sizes="(min-width: 1024px) 60vw, 100vw"
			width={p.width}
			height={p.height}
			alt={label}
			draggable="false"
		/>
		{#if withPins}
			<svg class="pins" viewBox="0 0 {p.width} {p.height}" aria-hidden="true">
				{#each pagePins as pin (pin.n)}
					<g transform="translate({pin.x! * p.width} {pin.y! * p.height})">
						<circle r={p.width * 0.014} />
						<text dy={p.width * 0.0055} font-size={p.width * 0.016}>{pin.n}</text>
					</g>
				{/each}
				{#if anchor && anchor.page === p.page}
					<g class="new" transform="translate({anchor.x * p.width} {anchor.y * p.height})"
						><circle r={p.width * 0.014} /></g
					>
				{/if}
			</svg>
		{/if}
		{#if compare}<figcaption>{label}</figcaption>{/if}
	</figure>
{/snippet}

<div class="stage z{zoom}" class:compare={compare && prevPage}>
	{#if !page}
		<p class="none">Esta versión aún no tiene páginas convertidas.</p>
	{:else if compare && prevPage && prev}
		{@render figure(prevPage, `${code} · rev. ${prev.revision} · ${faceName}`, false)}
		{@render figure(page, `${code} · rev. ${revision} · ${faceName}`, true)}
	{:else}
		{@render figure(page, `${faceName} de ${code}, revisión ${revision}`, true)}
	{/if}
</div>

<style>
	.stage {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 24px;
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 16px;
		background: var(--bg);
	}
	.page {
		position: relative;
		margin: 0;
		width: 100%;
		max-width: 920px;
		flex: none;
	}
	.compare .page {
		width: calc(50% - 8px);
	}
	.z150 .page {
		width: 150%;
		max-width: none;
	}
	.z200 .page {
		width: 200%;
		max-width: none;
	}
	.z150.compare .page,
	.z200.compare .page {
		width: 100%;
	}
	.stage.z150,
	.stage.z200 {
		justify-content: flex-start;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		background: #fff;
		border: 1px solid var(--line);
		user-select: none;
	}
	.anchoring {
		cursor: crosshair;
	}
	.pins {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		overflow: visible;
	}
	.pins circle {
		fill: var(--amber);
		stroke: #fff;
		stroke-width: 3;
	}
	.pins text {
		fill: var(--on-amber);
		text-anchor: middle;
		font-weight: 600;
		font-family: var(--font-sans);
	}
	.pins .new circle {
		fill: var(--ink);
	}
	figcaption {
		font-size: 12px;
		color: var(--muted);
		padding-top: 6px;
		font-family: var(--font-mono);
	}
	.none {
		color: var(--muted);
		align-self: center;
	}
	@media (max-width: 767px) {
		.stage {
			padding: 12px;
		}
		.compare {
			flex-direction: column;
		}
		.compare .page {
			width: 100%;
		}
	}
</style>
