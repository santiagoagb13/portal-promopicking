<script lang="ts">
	import { page } from '$app/state';
	import Button from '$components/ui/Button.svelte';
</script>

<main class="err">
	<p class="code num">{page.status}</p>
	<h1>{page.status === 403 ? 'No tienes acceso a esta sección' : page.error?.message}</h1>
	<Button href="/campanas" variant="primary">Ir a campañas</Button>
</main>

<style>
	.err {
		min-height: 100vh;
		display: grid;
		place-content: center;
		justify-items: start;
		gap: 16px;
		padding: 24px;
	}
	.code {
		font-family: var(--font-mono);
		color: var(--muted);
	}
</style>
