<!-- Reposiciones (8.8): catálogo y carrito por restaurante, pedidos y validación de los del QR. -->
<script lang="ts">
	import { page } from '$app/state';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import OrderForm from '$components/domain/orders/OrderForm.svelte';
	import { fmtDateTime, fmtDay, addDays } from '$lib/domain/dates';
	import { money, ORDER_STATE_LABEL, ORDER_STATES, ORDER_TONE } from '$lib/domain/orders';

	let { data, form } = $props();
	type Order = (typeof data.orders)[number];

	const cat = $derived.by(() => {
		const c = page.url.searchParams.get('cat');
		return c === 'generic' || c === 'lsm' ? c : null;
	});
	const qs = (p: Record<string, string | null>) => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const u = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(p)) {
			if (v === null) u.delete(k);
			else u.set(k, v);
		}
		const s = u.toString();
		return s ? `?${s}` : '?';
	};
	const columns = [
		{ key: 'id', label: 'Pedido', card: 'title' as const },
		{ key: 'restaurant', label: 'Restaurante', card: 'subtitle' as const },
		{ key: 'placedAt', label: 'Fecha' },
		{ key: 'lines', label: 'Líneas', align: 'right' as const },
		{ key: 'total', label: 'Importe', align: 'right' as const },
		{ key: 'state', label: 'Estado', card: 'aside' as const }
	];
</script>

<div class="head">
	<Segmented
		label="Vista"
		items={[
			{
				href: qs({ vista: null, estado: null }),
				label: 'Catálogo',
				active: data.vista === 'catalogo'
			},
			{
				href: qs({ vista: 'pedidos', cat: null }),
				label: 'Pedidos',
				active: data.vista === 'pedidos',
				count: data.toValidate.length
			}
		]}
	/>
	{#if data.vista === 'catalogo' && data.restaurants.length > 1}
		<form method="GET" class="pick">
			<label class="sr-only" for="r">Restaurante</label>
			<select id="r" name="r" class="input" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
				{#each data.restaurants as r (r.id)}
					<option value={r.id} selected={r.id === data.selected?.id}>{r.name} · {r.id}</option>
				{/each}
			</select>
			{#if cat}<input type="hidden" name="cat" value={cat} />{/if}
			<noscript><Button type="submit">Cambiar</Button></noscript>
		</form>
	{/if}
	{#if data.vista === 'catalogo'}
		<Segmented
			size="mini"
			label="Categoría"
			items={[
				{ href: qs({ cat: null }), label: 'Todo', active: !cat },
				{ href: qs({ cat: 'generic' }), label: 'Genéricos', active: cat === 'generic' },
				{ href: qs({ cat: 'lsm' }), label: 'LSM', active: cat === 'lsm' }
			]}
		/>
	{:else}
		<Segmented
			size="mini"
			label="Estado"
			items={[
				{ href: qs({ estado: null }), label: 'Todos', active: !data.estado },
				...ORDER_STATES.map((s) => ({
					href: qs({ estado: s }),
					label: ORDER_STATE_LABEL[s],
					active: data.estado === s
				}))
			]}
		/>
	{/if}
</div>

{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}

{#if data.toValidate.length && data.vista === 'pedidos' && !data.estado}
	<section class="queue" aria-labelledby="validar-t">
		<h2 id="validar-t">
			<QrCode size={18} strokeWidth={1.5} aria-hidden="true" /> Pedidos desde QR por validar · {data
				.toValidate.length}
		</h2>
		<ul>
			{#each data.toValidate as o (o.id)}
				<li>
					<a href="/reposiciones/pedidos/{o.id}" class="mono">{o.id}</a>
					<span>{o.restaurantName}</span>
					<small>{fmtDateTime(o.placedAt)}</small>
					<Button href="/reposiciones/pedidos/{o.id}" size={32}>Revisar</Button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.vista === 'catalogo'}
	{#if data.selected}
		{#key data.selected.id}
			<OrderForm
				restaurant={data.selected}
				catalog={data.catalog}
				category={cat}
				today={data.today}
			/>
		{/key}
	{:else}
		<EmptyState icon={ShoppingCart} text="No tienes restaurantes para los que pedir." />
	{/if}
{:else if data.orders.length}
	<DataTable
		caption="Pedidos de reposición"
		{columns}
		rows={data.orders}
		key={(o: Order) => o.id}
		rowHref={(o: Order) => `/reposiciones/pedidos/${o.id}`}
	>
		{#snippet cell(o: Order, col)}
			{#if col.key === 'id'}<a href="/reposiciones/pedidos/{o.id}" class="mono">{o.id}</a
				>{#if o.source === 'qr'}<small class="tag">QR</small>{/if}
			{:else if col.key === 'restaurant'}{o.restaurantName}
				<small class="mono">{o.restaurantId}</small>
			{:else if col.key === 'placedAt'}<span class="nowrap">{fmtDateTime(o.placedAt)}</span>
			{:else if col.key === 'lines'}<span class="num">{o.lines}</span>
			{:else if col.key === 'total'}<span class="num"
					>{o.source === 'qr' && !o.total ? '—' : money(o.total)}</span
				>
			{:else if col.key === 'state'}<Chip tone={ORDER_TONE[o.state]}
					>{ORDER_STATE_LABEL[o.state]}</Chip
				>
			{/if}
		{/snippet}
	</DataTable>
{:else}
	<EmptyState
		icon={ShoppingCart}
		text={data.estado ? 'No hay pedidos en este estado.' : 'Aún no hay pedidos.'}
	/>
{/if}

{#if form?.review}
	{@const rv = form.review}
	<ConfirmDialog
		id="enviar-revisado"
		title="¿Enviar el pedido de {rv.restaurantName}?"
		confirmLabel="Enviar pedido"
		action="?/pedir"
		fields={{
			r: rv.restaurantId,
			nota: rv.nota,
			...Object.fromEntries(rv.lines.map((l) => [`q-${l.itemId}`, String(l.qty)]))
		}}
		initiallyOpen
	>
		<ul class="review">
			{#each rv.lines as l (l.itemId)}<li>
					{l.qty} × {l.label} · {money(l.qty * l.unitPriceCents)}
				</li>{/each}
		</ul>
		<p>
			<b class="num">{money(rv.total)}</b> sin IVA · entrega prevista el {fmtDay(
				addDays(data.today, rv.leadDays)
			)} ({rv.leadDays} días).
		</p>
	</ConfirmDialog>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	.pick {
		display: flex;
		gap: 8px;
	}
	.pick .input {
		width: auto;
		max-width: 100%;
	}
	.queue {
		border: 1px solid var(--amber);
		background: var(--amber-bg);
		padding: 12px 16px;
		margin-bottom: 16px;
	}
	.queue h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 8px;
		color: var(--amber-ink);
	}
	.queue ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.queue li span {
		flex: 1;
	}
	small {
		font-size: 12px;
		color: var(--muted);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.tag {
		margin-left: 6px;
	}
	.nowrap {
		white-space: nowrap;
	}
	.review {
		margin: 0 0 8px;
		padding-left: 18px;
		font-size: 13px;
	}
</style>
