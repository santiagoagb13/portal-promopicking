<!--
	Diálogo de confirmación (7.1, regla 4; 7.4): `<dialog>` nativo, título como pregunta, acción con
	su color y «Cancelar». Con `typeToConfirm` exige escribir el nombre (acciones rojas sobre
	entidades con nombre); el navegador lo valida con `pattern` y el servidor lo vuelve a comprobar.

	Sin JavaScript, el disparador es un enlace a `?confirmar=…` y la página llega con el diálogo
	abierto (`initiallyOpen`); con JavaScript, se abre en modal sin navegar.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import Button from './Button.svelte';

	type Props = {
		id: string;
		title: string;
		description?: string;
		confirmLabel: string;
		tone?: 'primary' | 'green' | 'amber' | 'red';
		action: string;
		fields?: Record<string, string>;
		typeToConfirm?: string;
		initiallyOpen?: boolean;
		onresult?: (result: ActionResult) => void;
		children?: Snippet;
	};

	let {
		id,
		title,
		description,
		confirmLabel,
		tone = 'primary',
		action,
		fields = {},
		typeToConfirm,
		initiallyOpen = false,
		onresult,
		children
	}: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let typed = $state('');
	let busy = $state(false);

	const escapeForPattern = (s: string) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

	export function show() {
		typed = '';
		if (!dialog) return;
		if (dialog.open) dialog.close();
		dialog.showModal();
	}

	export function close() {
		dialog?.close();
	}

	$effect(() => {
		// Abierto desde el servidor (sin JS): al hidratar pasa a modal de verdad.
		if (initiallyOpen && dialog && !dialog.matches(':modal')) show();
	});

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success' || result.type === 'redirect') close();
			onresult?.(result);
			await update({ reset: false });
		};
	};
</script>

<dialog bind:this={dialog} {id} open={initiallyOpen || undefined} aria-labelledby="{id}-t">
	<form method="POST" {action} use:enhance={submit}>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<h2 class="dlg-h" id="{id}-t">{title}</h2>
		{#if description || children || typeToConfirm}
			<div class="dlg-b">
				{#if description}<p>{description}</p>{/if}
				{@render children?.()}
				{#if typeToConfirm}
					<label class="field confirm">
						<span>Escribe <b>{typeToConfirm}</b> para confirmar</span>
						<input
							class="input"
							name="confirmacion"
							autocomplete="off"
							required
							pattern={escapeForPattern(typeToConfirm)}
							bind:value={typed}
						/>
					</label>
				{/if}
			</div>
		{/if}
		<div class="dlg-f">
			<Button formmethod="dialog" formnovalidate type="submit">Cancelar</Button>
			<Button
				type="submit"
				variant={tone}
				disabled={busy || (typeToConfirm !== undefined && typed !== '' && typed !== typeToConfirm)}
				>{confirmLabel}</Button
			>
		</div>
	</form>
</dialog>

<style>
	dialog {
		margin: auto;
		border: 1px solid var(--line);
		border-radius: 0;
		padding: 0;
		width: min(var(--dlg), calc(100vw - 32px));
		background: var(--surface);
		color: var(--ink);
		box-shadow: none;
	}
	dialog:not(:modal)[open] {
		position: fixed;
		inset: 0;
		z-index: 60;
		outline: 100vmax solid var(--backdrop);
	}
	dialog::backdrop {
		background: var(--backdrop);
	}
	.dlg-h {
		padding: 20px 24px 8px;
		font-size: 18px;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.01em;
	}
	.dlg-b {
		padding: 4px 24px 16px;
		color: var(--muted);
		font-size: 13px;
		display: grid;
		gap: 12px;
	}
	.dlg-b :global(ul) {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--line);
	}
	.dlg-b :global(li) {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 10px;
		color: var(--ink);
	}
	.dlg-b :global(li + li) {
		border-top: 1px solid var(--line-soft);
	}
	.confirm b {
		color: var(--ink);
		font-weight: 500;
	}
	.dlg-f {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 24px 16px;
	}
	@media (max-width: 767px) {
		dialog {
			width: 100%;
			max-width: 100%;
			margin: auto 0 0;
			border-left: 0;
			border-right: 0;
			border-bottom: 0;
		}
		.dlg-f {
			flex-direction: column-reverse;
		}
		.dlg-f :global(.b) {
			height: 44px;
			width: 100%;
		}
	}
	/* 7.5, regla 10: la pregunta cabe en una línea hasta 360 px. */
	@media (max-width: 479px) {
		.dlg-h {
			font-size: 16px;
			padding: 16px 16px 8px;
		}
		.dlg-b {
			padding: 4px 16px 12px;
		}
		.dlg-f {
			padding: 12px 16px 16px;
		}
	}
</style>
