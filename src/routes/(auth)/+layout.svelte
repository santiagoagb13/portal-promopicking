<!-- Pantallas de acceso (8.1): logotipo y una sola tarea. En móvil ocupan toda la pantalla. -->
<script lang="ts">
	let { children } = $props();
</script>

<div class="auth">
	<header>
		<span class="logo-mark" aria-hidden="true">P</span>
		<span><b>Promopicking</b><small>Portal de servicio</small></span>
	</header>
	<main>{@render children()}</main>
	<footer>Solo guardamos tu nombre, tu correo y tu rol para darte acceso.</footer>
</div>

<style>
	.auth {
		min-height: 100vh;
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		width: min(400px, 100%);
		margin: 0 auto;
		padding: 32px 16px 24px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	header b {
		display: block;
		font-weight: 600;
		font-size: 15px;
	}
	header small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.logo-mark {
		width: 28px;
		height: 28px;
		background: var(--ink);
		color: var(--bg);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 14px;
	}
	main {
		align-self: center;
		display: grid;
		gap: 24px;
		padding: 48px 0;
	}
	footer {
		font-size: 12px;
		color: var(--muted);
	}
	main :global(h1) {
		font-size: 24px;
	}
	main :global(.lead) {
		color: var(--muted);
		margin-top: -16px;
	}
	main :global(.stack) {
		display: grid;
		gap: 12px;
	}
	main :global(.linkish) {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		justify-self: start;
		min-height: 44px;
	}
	main :global(.alert) {
		padding: 10px 12px;
		border-left: 2px solid var(--amber);
		background: var(--amber-bg);
		color: var(--amber-ink);
		font-size: 13px;
	}
</style>
