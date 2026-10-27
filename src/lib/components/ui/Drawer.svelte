<!--
	Panel lateral (8.3, 8.10): formularios de alta y edición. `<dialog>` modal a la derecha;
	en móvil, a pantalla completa. Como el diálogo de confirmación, sin JavaScript se abre por
	URL (`initiallyOpen`) y al cerrarlo se vuelve a `closeHref`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		id: string;
		title: string;
		initiallyOpen?: boolean;
		closeHref?: string;
		wide?: boolean;
		children: Snippet;
	};
	let { id, title, initiallyOpen = false, closeHref, wide = false, children }: Props = $props();
	let dialog: HTMLDialogElement | undefined = $state();
	/** Cierre interno para pasar de «abierto sin JS» a modal: no cuenta como cerrar. */
	let reopening = false;

	export function show() {
		if (!dialog) return;
		if (dialog.open && !dialog.matches(':modal')) {
			reopening = true;
			dialog.close();
		}
		if (!dialog.open) dialog.showModal();
	}
	export function close() {
		dialog?.close();
	}

	$effect(() => {
		if (initiallyOpen && dialog && !dialog.matches(':modal')) show();
	});

	function onclose() {
		if (reopening) {
			reopening = false;
			return;
		}
		if (initiallyOpen && closeHref)
			goto(closeHref, { replaceState: true, noScroll: true, keepFocus: true });
	}
</script>

<dialog
	bind:this={dialog}
	{id}
	class:wide
	open={initiallyOpen || undefined}
	aria-labelledby="{id}-t"
	{onclose}
>
	<header>
		<h2 id="{id}-t">{title}</h2>
		<form method="dialog">
			{#if closeHref}
				<a
					class="x"
					href={closeHref}
					aria-label="Cerrar"
					onclick={(e) => {
						e.preventDefault();
						close();
					}}><X size={20} strokeWidth={1.5} /></a
				>
			{:else}
				<button class="x" aria-label="Cerrar"><X size={20} strokeWidth={1.5} /></button>
			{/if}
		</form>
	</header>
	<div class="body">{@render children()}</div>
</dialog>

<style>
	dialog {
		margin: 0 0 0 auto;
		height: 100dvh;
		max-height: 100dvh;
		width: min(480px, 100vw);
		max-width: 100vw;
		border: 0;
		border-left: 1px solid var(--line);
		border-radius: 0;
		padding: 0;
		background: var(--surface);
		color: var(--ink);
		box-shadow: none;
		overflow: hidden;
	}
	dialog[open] {
		display: flex;
		flex-direction: column;
	}
	dialog.wide {
		width: min(720px, 100vw);
	}
	dialog:not(:modal)[open] {
		position: fixed;
		inset: 0 0 0 auto;
		z-index: 60;
		outline: 100vmax solid var(--backdrop);
	}
	dialog::backdrop {
		background: var(--backdrop);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: var(--top);
		padding: 0 8px 0 24px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	h2 {
		font-size: 18px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.x {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border: 0;
		background: transparent;
		color: inherit;
		border-radius: 2px;
	}
	.x:hover {
		background: var(--line-soft);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
	}
	.body :global(.form) {
		display: grid;
		gap: 16px;
	}
	.body :global(.row2) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.body :global(.actions) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding-top: 8px;
	}
	@media (max-width: 767px) {
		dialog,
		dialog.wide {
			width: 100vw;
			border-left: 0;
		}
		header {
			padding-left: 16px;
		}
		.body {
			padding: 16px;
		}
		.body :global(.row2) {
			grid-template-columns: 1fr;
		}
		.body :global(.actions) {
			flex-direction: column-reverse;
		}
		.body :global(.actions .b) {
			width: 100%;
		}
	}
</style>
