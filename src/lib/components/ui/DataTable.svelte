<!--
	Tabla que pasa a fichas (7.4; 7.5, reglas 5, 7 y 9):
	· ≥ 1024 px: tabla con filas de 40 px (36 px con `dense`).
	· 768–1023 px: fichas a dos columnas.
	· < 768 px: fichas a una columna; se muestran `mobilePage` filas y «Ver más».
	Cada columna dice su papel en la ficha: título, subtítulo, lateral o campo con etiqueta.
-->
<script lang="ts" generics="Row">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';

	type Column = {
		key: string;
		label: string;
		/** Etiqueta abreviada para la cabecera (con el nombre completo en `title`). */
		abbr?: string;
		align?: 'left' | 'right' | 'center';
		card?: 'title' | 'subtitle' | 'aside' | 'field';
		sort?: { href: string; dir: 'ascending' | 'descending' | 'none' };
	};

	type Props = {
		columns: Column[];
		rows: Row[];
		key: (row: Row) => string;
		cell: Snippet<[Row, Column]>;
		rowHref?: (row: Row) => string;
		caption: string;
		dense?: boolean;
		mobilePage?: number;
		/** Enlace de «Ver más» sin JavaScript (p. ej. `?todas=1`). */
		moreHref?: string;
		expanded?: boolean;
	};

	let {
		columns,
		rows,
		key,
		cell,
		rowHref,
		caption,
		dense = false,
		mobilePage = 8,
		moreHref,
		expanded = false
	}: Props = $props();

	let showAll = $state(false);
	const all = $derived(expanded || showAll);
	const hidden = $derived(Math.max(0, rows.length - mobilePage));

	function onRowClick(e: MouseEvent, row: Row) {
		if (!rowHref) return;
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, select, textarea, [tabindex]:not(tr)')) return;
		goto(rowHref(row));
	}
</script>

<div class="wrap">
	<table class="tbl" class:dense class:all>
		<caption class="sr-only">{caption}</caption>
		<thead>
			<tr>
				{#each columns as col (col.key)}
					<th class="a-{col.align ?? 'left'}" aria-sort={col.sort?.dir} scope="col">
						{#if col.sort}
							<a href={col.sort.href} data-sveltekit-noscroll data-sveltekit-replacestate>
								{#if col.abbr}<abbr title={col.label}>{col.abbr}</abbr>{:else}{col.label}{/if}
								<ArrowUpDown size={14} strokeWidth={1.5} aria-hidden="true" />
							</a>
						{:else if col.abbr}
							<abbr title={col.label}>{col.abbr}</abbr>
						{:else}
							{col.label}
						{/if}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (key(row))}
				<tr class:more={i >= mobilePage} class:link={!!rowHref} onclick={(e) => onRowClick(e, row)}>
					{#each columns as col (col.key)}
						<td class="a-{col.align ?? 'left'} c-{col.card ?? 'field'}" data-l={col.label}>
							{@render cell(row, col)}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if hidden > 0 && !all}
		<a
			class="more-btn"
			href={moreHref ?? '?todas=1'}
			data-sveltekit-noscroll
			onclick={(e) => {
				e.preventDefault();
				showAll = true;
			}}>Ver más <span class="count">{hidden}</span></a
		>
	{/if}
</div>

<style>
	.wrap {
		min-width: 0;
	}
	.tbl {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		height: 40px;
		padding: 0 16px;
		text-align: left;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		font-size: 12px;
		font-weight: 400;
		color: var(--muted);
	}
	th a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	th a:hover {
		color: var(--ink);
	}
	th[aria-sort='ascending'] a,
	th[aria-sort='descending'] a {
		color: var(--ink);
	}
	td {
		height: 40px;
		padding: 0 16px;
		border-bottom: 1px solid var(--line-soft);
		vertical-align: middle;
	}
	.dense td,
	.dense th {
		height: 36px;
	}
	th:first-child,
	td:first-child {
		padding-left: 0;
	}
	th:last-child,
	td:last-child {
		padding-right: 0;
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	tr.link {
		cursor: pointer;
	}
	tbody tr {
		transition: background var(--t);
	}
	tbody tr:hover {
		background: var(--line-soft);
	}
	.a-right {
		text-align: right;
	}
	.a-center {
		text-align: center;
	}
	abbr {
		text-decoration: none;
	}
	td[data-l]::before {
		display: none;
	}
	.more-btn {
		display: none;
	}

	/* Fichas: tablet y móvil. */
	@media (max-width: 1023px) {
		thead {
			display: none;
		}
		.tbl,
		tbody,
		tr,
		td {
			display: block;
		}
		tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-auto-flow: row dense;
			gap: 4px 12px;
			padding: 16px 0;
			border-bottom: 1px solid var(--line);
			background: transparent;
		}
		tbody tr:hover {
			background: transparent;
		}
		td,
		.dense td,
		td.a-right,
		td.a-center {
			height: auto;
			padding: 0;
			border: 0;
			text-align: left;
		}
		td:first-child,
		td:last-child {
			padding: 0;
		}
		.c-title,
		.c-subtitle {
			grid-column: 1;
		}
		.c-aside {
			grid-column: 2;
			grid-row: 1 / span 2;
			align-self: start;
		}
		.c-field {
			grid-column: 1 / -1;
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 13px;
		}
		.c-field:nth-child(3),
		.c-subtitle + .c-field {
			margin-top: 6px;
		}
		td.c-field[data-l]::before {
			display: inline-block;
			content: attr(data-l);
			width: 108px;
			flex: none;
			font-size: 12px;
			color: var(--muted);
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		tbody {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0 32px;
		}
	}
	@media (max-width: 767px) {
		tbody tr {
			padding: 12px 0;
		}
		.tbl:not(.all) tr.more {
			display: none;
		}
		.more-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			width: 100%;
			height: 44px;
			margin-top: 8px;
			border: 1px solid var(--line);
			border-radius: 2px;
			background: var(--surface);
			font-weight: 500;
		}
		.count {
			font-size: 11px;
			font-weight: 600;
			min-width: 18px;
			height: 18px;
			padding: 0 5px;
			display: inline-grid;
			place-items: center;
			background: var(--line-soft);
			border-radius: 2px;
		}
	}
</style>
