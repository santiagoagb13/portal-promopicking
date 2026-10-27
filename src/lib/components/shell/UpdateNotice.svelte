<!-- Aviso de nueva versión (9.1): nunca recarga sola; la persona decide cuándo. -->
<script lang="ts">
	import { updated } from '$app/state';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	async function reload() {
		const reg = await navigator.serviceWorker?.getRegistration();
		reg?.waiting?.postMessage('activar');
		location.reload();
	}
</script>

{#if updated.current}
	<button type="button" class="update" onclick={reload}>
		<RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />Nueva versión · Actualizar
	</button>
{/if}

<style>
	.update {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}
</style>
