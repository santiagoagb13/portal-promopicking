<!-- Páginas públicas (sin sesión ni carcasa): la landing del QR de versión y el aviso legal. -->
<script lang="ts">
	let { children } = $props();
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<div class="public">
	<header><span class="logo-mark" aria-hidden="true">P</span><b>Promopicking</b></header>
	<main>{@render children()}</main>
</div>

<style>
	.public {
		min-height: 100dvh;
		width: min(480px, 100%);
		margin: 0 auto;
		padding: 24px 16px;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 24px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
	}
	.logo-mark {
		width: 24px;
		height: 24px;
		background: var(--ink);
		color: var(--bg);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 13px;
	}
</style>
