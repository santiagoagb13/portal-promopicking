<!-- Aviso (7.4): una línea, icono, «Deshacer» opcional. Región `aria-live` para lectores de pantalla. -->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Info from '@lucide/svelte/icons/info';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { Toaster } from './toast.svelte';

	let { toaster, initial }: { toaster: Toaster; initial?: string | null } = $props();
	const icons = { neutral: Info, green: Check, amber: CircleAlert, red: CircleAlert };
	// El aviso que llega en el HTML (formulario sin JS) se sustituye por el de la cola al hidratar.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});
</script>

<div class="toasts" role="status" aria-live="polite">
	{#if initial && !hydrated}
		<!-- Respuesta de un formulario enviado sin JavaScript. -->
		<div class="toast"><Info size={18} strokeWidth={1.5} /><span>{initial}</span></div>
	{/if}
	{#each toaster.items as t (t.id)}
		{@const Icon = icons[t.tone]}
		<div class="toast {t.tone}">
			<Icon size={18} strokeWidth={1.5} />
			<span>{t.text}</span>
			{#if t.undo}
				<button
					type="button"
					class="undo"
					onclick={async () => {
						toaster.dismiss(t.id);
						await t.undo?.();
					}}>Deshacer</button
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		left: 50%;
		bottom: 24px;
		transform: translateX(-50%);
		display: grid;
		gap: 8px;
		z-index: 70;
		width: max-content;
		max-width: calc(100vw - 32px);
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 8px 0 14px;
		background: var(--ink);
		color: var(--bg);
		border-radius: 2px;
		font-size: 13px;
	}
	.toast span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-right: 6px;
	}
	.green :global(svg) {
		color: color-mix(in srgb, var(--green) 70%, var(--bg));
	}
	.amber :global(svg) {
		color: var(--amber);
	}
	.red :global(svg) {
		color: color-mix(in srgb, var(--red) 70%, var(--bg));
	}
	.undo {
		height: 32px;
		padding: 0 10px;
		border: 0;
		border-left: 1px solid color-mix(in srgb, var(--bg) 25%, transparent);
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 500;
	}
	@media (max-width: 767px) {
		.toasts {
			bottom: calc(var(--tab) + 12px);
		}
	}
</style>
