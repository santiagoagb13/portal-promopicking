<!-- Administración › Auditoría (5.4): filtros en la URL y exportación a CSV. -->
<script lang="ts">
	import { page } from '$app/state';
	import Download from '@lucide/svelte/icons/download';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Button from '$components/ui/Button.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data } = $props();
	type Row = (typeof data.rows)[number];
	const query = $derived(page.url.searchParams.toString());

	function pageHref(n: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		p.set('pagina', String(n));
		return `?${p}`;
	}
	const summary = (v: unknown) => {
		if (!v || typeof v !== 'object') return '';
		return Object.entries(v as Record<string, unknown>)
			.map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`)
			.join(' · ');
	};

	const columns = [
		{ key: 'at', label: 'Fecha' },
		{ key: 'who', label: 'Usuario', card: 'title' as const },
		{ key: 'action', label: 'Acción', card: 'subtitle' as const },
		{ key: 'entity', label: 'Entidad' },
		{ key: 'detail', label: 'Detalle' }
	];
</script>

<form method="GET" class="filters" data-sveltekit-replacestate data-sveltekit-noscroll>
	<label class="field">
		<span>Usuario</span>
		<select class="input" name="usuario" value={data.filters.userId ?? ''}>
			<option value="">Todos</option>
			{#each data.people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
	</label>
	<label class="field">
		<span>Acción</span>
		<input
			class="input"
			name="accion"
			list="acciones"
			value={data.filters.action ?? ''}
			placeholder="p. ej. invitation"
		/>
		<datalist id="acciones"
			>{#each data.actions as a (a)}<option value={a}></option>{/each}</datalist
		>
	</label>
	<label class="field"
		><span>Entidad o id</span><input
			class="input"
			name="entidad"
			value={data.filters.entity ?? ''}
		/></label
	>
	<label class="field"
		><span>Desde</span><input
			class="input"
			type="date"
			name="desde"
			value={data.filters.from ?? ''}
		/></label
	>
	<label class="field"
		><span>Hasta</span><input
			class="input"
			type="date"
			name="hasta"
			value={data.filters.to ?? ''}
		/></label
	>
	<div class="btns">
		<Button type="submit">Filtrar</Button>
		<Button
			href="/admin/auditoria/exportar{query ? `?${query}` : ''}"
			variant="ghost"
			icon={Download}
			label="Exportar CSV"
			tipPos="left"
		/>
	</div>
</form>

<p class="muted">{data.total} registros</p>
{#if data.rows.length}
	<DataTable
		caption="Auditoría"
		{columns}
		rows={data.rows}
		key={(r: Row) => String(r.id)}
		dense
		mobilePage={50}
	>
		{#snippet cell(r: Row, col)}
			{#if col.key === 'at'}
				<span class="num nowrap">{fmtDateTime(r.at)}</span>
			{:else if col.key === 'who'}
				{r.userName ?? (r.userId ? r.userId : 'Sistema')}
			{:else if col.key === 'action'}
				<code>{r.action}</code>
			{:else if col.key === 'entity'}
				{#if r.entity}<span class="muted">{r.entity}</span> {r.entityId ?? ''}{/if}
			{:else if col.key === 'detail'}
				<span class="detail" title={summary(r.after)}>{summary(r.after) || summary(r.before)}</span>
			{/if}
		{/snippet}
	</DataTable>
	{#if data.pages > 1}
		<nav class="pager" aria-label="Páginas">
			{#if data.page > 1}<Button
					href={pageHref(data.page - 1)}
					variant="ghost"
					icon={ChevronLeft}
					label="Anterior"
				/>{/if}
			<span class="num">{data.page} / {data.pages}</span>
			{#if data.page < data.pages}<Button
					href={pageHref(data.page + 1)}
					variant="ghost"
					icon={ChevronRight}
					label="Siguiente"
				/>{/if}
		</nav>
	{/if}
{:else}
	<EmptyState icon={ScrollText} text="Ningún registro con esos filtros." />
{/if}

<style>
	.filters {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
		gap: 12px;
		align-items: end;
		padding-bottom: 16px;
	}
	.btns {
		display: flex;
		gap: 4px;
	}
	.muted {
		color: var(--muted);
		font-size: 12px;
	}
	code {
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.nowrap {
		white-space: nowrap;
	}
	.detail {
		display: block;
		max-width: min(360px, 22vw);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--muted);
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding-top: 16px;
	}
	@media (max-width: 1023px) {
		.filters {
			grid-template-columns: 1fr 1fr;
		}
		.detail {
			max-width: 100%;
			white-space: normal;
		}
	}
	@media (max-width: 479px) {
		.filters {
			grid-template-columns: 1fr;
		}
	}
</style>
