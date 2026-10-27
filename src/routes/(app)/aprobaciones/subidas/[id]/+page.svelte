<!-- Revisión de una subida (8.5): el código leído del nombre de cada fichero se confirma antes de publicar. -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Send from '@lucide/svelte/icons/send';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { page } from '$app/state';
	import { fmtSize } from '$lib/domain/dates';

	let { data, form } = $props();
	const valid = $derived(data.items.filter((i) => !i.error));
	const open = $derived(!data.upload.publishedAt && !data.upload.discardedAt);
	let publish: ConfirmDialog | undefined = $state();
	let discard: ConfirmDialog | undefined = $state();
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
</script>

<div class="head">
	<Button
		href="/aprobaciones?soporte={data.support.id}"
		variant="ghost"
		icon={ChevronLeft}
		label="Volver a {data.support.name}"
	/>
	<div class="grow">
		<b>{data.support.name}</b>
		<small
			>{data.support.campaignName} · {data.items.length} ficheros · {valid.length} válidos</small
		>
	</div>
	{#if open}
		<Button
			href="?confirmar=descartar"
			variant="red"
			icon={Trash2}
			label="Descartar la subida"
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				discard?.show();
			}}
		/>
	{/if}
</div>

<form method="POST" action="?/publicar" id="publicar-form">
	<table class="files">
		<caption class="sr-only">Ficheros subidos</caption>
		<thead><tr><th>Fichero</th><th>Código de versión</th><th>Resultado</th></tr></thead>
		<tbody>
			{#each data.items as item (item.id)}
				<tr>
					<td
						><span class="mono">{item.originalName}</span><small class="num"
							>{fmtSize(item.size)}</small
						></td
					>
					<td>
						{#if item.error}
							—
						{:else}
							<label class="sr-only" for="codigo-{item.id}">Código de {item.originalName}</label>
							<input
								id="codigo-{item.id}"
								class="input mono"
								name="codigo_{item.id}"
								list="codigos"
								required
								value={form?.codes?.[item.id] ?? item.detectedCode ?? ''}
								disabled={!open}
							/>
						{/if}
					</td>
					<td>
						{#if item.error}<Chip tone="red">{item.error}</Chip>
						{:else if item.match}<Chip tone="amber"
								>Nueva revisión de {item.match.code} (rev. {item.match.revision + 1})</Chip
							>
						{:else}<Chip tone="primary">Versión nueva</Chip>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<datalist id="codigos"
		>{#each data.codes as c (c)}<option value={c}></option>{/each}</datalist
	>
	{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
	{#if open && valid.length}
		<div class="actions">
			<Button
				href="?confirmar=publicar"
				variant="primary"
				icon={Send}
				onclick={(e: MouseEvent) => {
					e.preventDefault();
					publish?.show();
				}}>Publicar {valid.length} {valid.length === 1 ? 'versión' : 'versiones'}</Button
			>
		</div>
	{:else if data.upload.publishedAt}
		<p class="muted">Publicada.</p>
	{/if}
</form>

{#if open}
	<!-- La confirmación envía el formulario de la tabla (con los códigos revisados). -->
	<ConfirmDialog
		bind:this={publish}
		id="publicar"
		title="¿Publicar {valid.length} {valid.length === 1 ? 'versión' : 'versiones'} de {data.support
			.name}?"
		description="Se convierten las páginas para el visor y se avisa a marketing de la marca para que las apruebe."
		confirmLabel="Publicar"
		action="?/publicar"
		formId="publicar-form"
		initiallyOpen={confirmar === 'publicar'}
	/>
	<ConfirmDialog
		bind:this={discard}
		id="descartar"
		title="¿Descartar la subida?"
		description="Se borran los ficheros subidos. No se publica nada."
		confirmLabel="Descartar"
		tone="red"
		action="?/descartar"
		initiallyOpen={confirmar === 'descartar'}
	/>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 16px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.grow b {
		display: block;
		font-weight: 500;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.files {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		text-align: left;
		font-size: 12px;
		font-weight: 400;
		color: var(--muted);
		height: 40px;
		border-bottom: 1px solid var(--line);
	}
	td {
		padding: 8px 12px 8px 0;
		border-bottom: 1px solid var(--line-soft);
		vertical-align: middle;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 16px;
	}
	.muted {
		color: var(--muted);
		padding-top: 16px;
	}
	@media (max-width: 767px) {
		thead {
			display: none;
		}
		tr,
		td {
			display: block;
		}
		tr {
			padding: 12px 0;
			border-bottom: 1px solid var(--line);
		}
		td {
			border: 0;
			padding: 4px 0;
		}
	}
</style>
