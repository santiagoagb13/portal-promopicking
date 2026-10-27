<!--
	Catálogo y carrito de un restaurante (8.8). Las cantidades viven en el formulario: sin JS se
	envía a «revisar» y el servidor devuelve el resumen para confirmar; con JS el total se calcula
	aquí y «Enviar pedido» abre la confirmación con total y plazo.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { addDays, fmtDay } from '$lib/domain/dates';
	import { CATEGORY_LABEL, cartLead, cartTotal, MAX_LINE_QTY, money } from '$lib/domain/orders';

	type Item = {
		id: string;
		category: 'generic' | 'lsm';
		brandCode: string | null;
		name: string;
		description: string;
		unit: string;
		priceCents: number;
		leadDays: number;
	};
	type Props = {
		restaurant: { id: string; name: string; address: string; city: string; brandShort: string };
		catalog: Item[];
		category: 'generic' | 'lsm' | null;
		today: string;
	};
	let { restaurant, catalog, category, today }: Props = $props();

	let qty = $state<Record<string, number>>({});
	let nota = $state('');
	let confirm: ConfirmDialog | undefined = $state();

	const lines = $derived(
		catalog.flatMap((i) => {
			const n = qty[i.id] ?? 0;
			return n > 0 ? [{ ...i, qty: n, unitPriceCents: i.priceCents }] : [];
		})
	);
	const total = $derived(cartTotal(lines));
	const lead = $derived(cartLead(lines));
	const units = $derived(lines.reduce((n, l) => n + l.qty, 0));

	const clamp = (n: number) => Math.min(MAX_LINE_QTY, Math.max(0, Math.round(n) || 0));
	const bump = (id: string, d: number) => (qty[id] = clamp((qty[id] ?? 0) + d));
</script>

<form
	id="pedido"
	method="POST"
	action="?/pedir"
	class="layout"
	use:enhance={() =>
		async ({ result, update }) => {
			confirm?.close();
			if (result.type === 'success') {
				qty = {};
				nota = '';
			}
			await update({ reset: false });
		}}
>
	<input type="hidden" name="r" value={restaurant.id} />
	<section class="catalog" aria-label="Catálogo">
		<p class="note">
			Precios sin IVA ni transporte. El plazo cuenta desde la confirmación del pedido.
		</p>
		<ul class="grid">
			{#each catalog as i (i.id)}
				<li class="item" hidden={category !== null && i.category !== category}>
					<div class="row">
						<Chip tone={i.category === 'lsm' ? 'info' : 'primary'}
							>{CATEGORY_LABEL[i.category]}</Chip
						>
						<small>{i.brandCode ? restaurant.brandShort : 'Todas las marcas'}</small>
					</div>
					<div class="nm">
						<b id="n-{i.id}">{i.name}</b>
						<button
							type="button"
							class="help"
							aria-label="Descripción técnica: {i.description}"
							data-tip={i.description}>?</button
						>
					</div>
					<div class="pr">
						<span class="num">{money(i.priceCents)}</span>
						<small>/ {i.unit} · {i.leadDays} días</small>
					</div>
					<div class="add">
						<Button
							size={32}
							icon={Minus}
							label="Quitar una"
							onclick={() => bump(i.id, -1)}
							disabled={!qty[i.id]}
						/>
						<input
							class="input qty num"
							type="number"
							inputmode="numeric"
							name="q-{i.id}"
							min="0"
							max={MAX_LINE_QTY}
							aria-labelledby="n-{i.id}"
							value={qty[i.id] ?? 0}
							oninput={(e) => (qty[i.id] = clamp(e.currentTarget.valueAsNumber))}
						/>
						<Button
							size={32}
							variant="primary"
							icon={Plus}
							label="Añadir una"
							onclick={() => bump(i.id, 1)}
						/>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<aside class="cart" id="carrito" aria-labelledby="carrito-t">
		<h2 id="carrito-t">Pedido · {restaurant.name}</h2>
		{#if lines.length}
			<ul class="lines">
				{#each lines as l (l.id)}
					<li>
						<span>{l.qty} × {l.name}</span><span class="num">{money(l.qty * l.unitPriceCents)}</span
						>
					</li>
				{/each}
			</ul>
			<p class="total"><span>Total (sin IVA)</span><span class="num">{money(total)}</span></p>
		{:else}
			<p class="muted">
				Elige cantidades en el catálogo. También se pide desde el QR de cada pieza.
			</p>
		{/if}
		<label class="field">
			<span>Observaciones para la entrega</span>
			<textarea
				class="input area"
				name="nota"
				maxlength="500"
				placeholder="Horario de recepción, persona de contacto…"
				bind:value={nota}></textarea>
		</label>
		<p class="muted">
			{restaurant.address}, {restaurant.city}
			{#if lead}<br />Entrega prevista: {fmtDay(addDays(today, lead))}{/if}
		</p>
		<Button
			type="submit"
			formaction="?/revisar"
			variant="primary"
			size={44}
			class="block"
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				if (lines.length) confirm?.show();
			}}>Enviar pedido</Button
		>
	</aside>

	<div class="bar" aria-hidden={!lines.length}>
		<span><b class="num">{money(total)}</b> · {units} uds.</span>
		<Button href="#carrito" variant="primary">Ver pedido</Button>
	</div>
</form>

<ConfirmDialog
	bind:this={confirm}
	id="enviar"
	title="¿Enviar el pedido de {restaurant.name}?"
	confirmLabel="Enviar pedido"
	action="?/pedir"
	formId="pedido"
>
	<p>{units} unidades · <b class="num">{money(total)}</b> sin IVA.</p>
	<p>Entrega prevista el {fmtDay(addDays(today, lead))} ({lead} días).</p>
</ConfirmDialog>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 24px;
		align-items: start;
	}
	.note,
	.muted {
		font-size: 13px;
		color: var(--muted);
		margin: 0 0 12px;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
	}
	.item {
		border: 1px solid var(--line);
		padding: 12px;
		display: grid;
		gap: 8px;
		align-content: start;
	}
	.item[hidden] {
		display: none;
	}
	.row,
	.nm,
	.add {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row {
		justify-content: space-between;
	}
	small {
		font-size: 12px;
		color: var(--muted);
	}
	b {
		font-weight: 500;
	}
	.help {
		flex: none;
		width: 20px;
		height: 20px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: none;
		color: var(--muted);
		font-size: 12px;
		cursor: help;
	}
	.pr .num {
		font-size: 16px;
		font-weight: 600;
	}
	.qty {
		width: 72px;
		height: 32px;
		text-align: center;
	}
	.cart {
		position: sticky;
		top: calc(var(--top) + 16px);
		border: 1px solid var(--line);
		padding: 16px;
		display: grid;
		gap: 12px;
	}
	h2 {
		font-size: 15px;
		font-weight: 600;
		margin: 0;
	}
	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		font-size: 13px;
	}
	.lines li,
	.total {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.total {
		border-top: 1px solid var(--line);
		padding-top: 8px;
		margin: 0;
		font-weight: 600;
	}
	.area {
		height: auto;
		min-height: 64px;
		padding: 8px 12px;
		resize: vertical;
	}
	.cart :global(.block) {
		width: 100%;
	}
	.bar {
		display: none;
	}
	@media (max-width: 1023px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.cart {
			position: static;
		}
		.bar:not([aria-hidden='true']) {
			position: sticky;
			bottom: calc(var(--tab) + env(safe-area-inset-bottom) + 8px);
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 8px 12px;
			background: var(--surface);
			border: 1px solid var(--line);
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.bar:not([aria-hidden='true']) {
			bottom: 8px;
		}
	}
</style>
