<!-- Previsualización de la importación (8.10): altas, cambios y bajas antes de confirmar. -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Check from '@lucide/svelte/icons/check';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { page } from '$app/state';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form } = $props();
	const d = $derived(data.imp.diff);
	let dialog: ConfirmDialog | undefined = $state();
	const total = $derived(d.added.length + d.changed.length + d.removed.length);
	const label = (k: string) =>
		(data.labels as Record<string, string>)[k] ?? (k === 'active' ? 'Activo' : k);
</script>

<div class="head">
	<Button href="/maestro" variant="ghost" icon={ChevronLeft} label="Volver al maestro" />
	<div class="grow">
		<b>{data.imp.fileName}</b>
		<small
			>Subido {fmtDateTime(data.imp.createdAt)} · {data.imp.brandCodes.join(', ') ||
				'sin marcas válidas'}</small
		>
	</div>
	{#if data.imp.appliedAt}
		<Chip tone="green">Aplicada {fmtDateTime(data.imp.appliedAt)}</Chip>
	{:else if !d.errors.length && total}
		<Button
			href="?confirmar=aplicar"
			variant="primary"
			icon={Check}
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				dialog?.show();
			}}>Aplicar</Button
		>
	{/if}
</div>

<section class="counts" aria-label="Resumen">
	<div><span class="num">{d.added.length}</span>altas</div>
	<div><span class="num">{d.changed.length}</span>con cambios</div>
	<div><span class="num">{d.removed.length}</span>bajas</div>
	<div class:bad={d.errors.length}><span class="num">{d.errors.length}</span>errores</div>
</section>
{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}

{#if d.errors.length}
	<section>
		<h2>Errores · corrígelos en el Excel y vuelve a subirlo</h2>
		<ul class="list">
			{#each d.errors as e, i (i)}<li>
					<span class="num rown">Fila {e.row}</span>{e.message}
				</li>{/each}
		</ul>
	</section>
{/if}
{#if d.added.length}
	<section>
		<h2>Altas</h2>
		<ul class="list">
			{#each d.added as r (r.id)}<li>
					<span class="id">{r.id}</span>{r.name} · {r.city} · {r.tariff}
					{r.language}
				</li>{/each}
		</ul>
	</section>
{/if}
{#if d.changed.length}
	<section>
		<h2>Cambios</h2>
		<ul class="list">
			{#each d.changed as c (c.id)}
				<li>
					<span class="id">{c.id}</span>{Object.entries(c.changes)
						.map(([k, v]) => `${label(k)}: ${v.from ?? '—'} → ${v.to ?? '—'}`)
						.join(' · ')}
				</li>
			{/each}
		</ul>
	</section>
{/if}
{#if d.removed.length}
	<section>
		<h2>Bajas · no están en el fichero</h2>
		<ul class="list">
			{#each d.removed as r (r.id)}<li><span class="id">{r.id}</span>{r.name}</li>{/each}
		</ul>
	</section>
{/if}
{#if !total && !d.errors.length}<p class="muted">
		El fichero coincide con el maestro: no hay nada que aplicar.
	</p>{/if}

<ConfirmDialog
	bind:this={dialog}
	id="aplicar"
	title="¿Aplicar {d.added.length} altas, {d.changed.length} cambios y {d.removed.length} bajas?"
	description="Se registra en el histórico de cada restaurante."
	confirmLabel="Aplicar"
	action="?/aplicar"
	initiallyOpen={page.url.searchParams.get('confirmar') === 'aplicar'}
/>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.grow b {
		display: block;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	small {
		font-size: 12px;
		color: var(--muted);
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border-bottom: 1px solid var(--line);
		margin-bottom: 24px;
	}
	.counts div {
		padding: 16px 0;
		color: var(--muted);
		font-size: 12px;
	}
	.counts .num {
		display: block;
		font-size: 28px;
		color: var(--ink);
		font-weight: 500;
	}
	.counts .bad .num {
		color: var(--red);
	}
	section {
		margin-bottom: 24px;
	}
	h2 {
		margin-bottom: 8px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	.list li {
		display: flex;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.id,
	.rown {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
		flex: none;
		width: 72px;
	}
	.muted {
		color: var(--muted);
	}
	@media (max-width: 479px) {
		.counts {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
