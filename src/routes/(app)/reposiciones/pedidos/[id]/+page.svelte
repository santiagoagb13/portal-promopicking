<!-- Detalle del pedido (8.8): líneas, eventos y acciones según el estado y el perfil. -->
<script lang="ts">
	import { page } from '$app/state';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Truck from '@lucide/svelte/icons/truck';
	import LifeBuoy from '@lucide/svelte/icons/life-buoy';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { fmtDateTime } from '$lib/domain/dates';
	import { ADVANCE_LABEL, money, ORDER_STATE_LABEL, ORDER_TONE } from '$lib/domain/orders';

	let { data, form } = $props();
	const o = $derived(data.order);
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	const open = (k: string) => (e: MouseEvent) => {
		e.preventDefault();
		dialogs[k]?.show();
	};
	const events = $derived(
		[
			{
				at: o.placedAt,
				text:
					o.source === 'qr'
						? `Pedido desde el QR ${o.qrCode ?? ''}`
						: `Pedido por ${o.placedBy ?? 'usuario eliminado'}`
			},
			o.validatedAt && { at: o.validatedAt, text: 'Validado por Promopicking' },
			o.shippedAt && { at: o.shippedAt, text: 'Sale a reparto' },
			o.deliveredAt && { at: o.deliveredAt, text: 'Entregado' },
			o.cancelledAt && {
				at: o.cancelledAt,
				text: o.reason ? `Cancelado · ${o.reason}` : 'Cancelado'
			}
		].filter((e): e is { at: Date; text: string } => !!e)
	);
	const hasPrices = $derived(o.lines.some((l) => l.unitPriceCents > 0));
</script>

<div class="bar">
	<Button
		href="/reposiciones?vista=pedidos"
		variant="ghost"
		icon={ChevronLeft}
		label="Volver a pedidos"
	/>
	<h2 class="mono">{o.id}</h2>
	<Chip tone={ORDER_TONE[o.state]}>{ORDER_STATE_LABEL[o.state]}</Chip>
	{#if o.source === 'qr'}<Chip tone="outline">Desde QR</Chip>{/if}
	<div class="spacer"></div>
	<Button href="/soporte?nuevo=1&pedido={o.id}&restaurante={o.restaurantId}" icon={LifeBuoy}
		>Abrir consulta</Button
	>
</div>

{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}

<div class="cols">
	<section aria-labelledby="lineas-t">
		<h3 id="lineas-t">Líneas</h3>
		<table>
			<thead
				><tr
					><th>Artículo</th><th class="r">Cantidad</th>{#if hasPrices}<th class="r">Precio</th><th
							class="r">Importe</th
						>{/if}</tr
				></thead
			>
			<tbody>
				{#each o.lines as l (l.id)}
					<tr>
						<td
							>{l.label}{#if l.versionCode}<small class="mono tag">{l.versionCode}</small>{/if}</td
						>
						<td class="r num"
							>{l.qty}{#if l.unit}<small class="tag">{l.unit}</small>{/if}</td
						>
						{#if hasPrices}<td class="r num">{money(l.unitPriceCents)}</td><td class="r num"
								>{money(l.qty * l.unitPriceCents)}</td
							>{/if}
					</tr>
				{/each}
			</tbody>
			{#if hasPrices}<tfoot
					><tr><th colspan="3">Total (sin IVA)</th><td class="r num">{money(o.total)}</td></tr
					></tfoot
				>{/if}
		</table>
		{#if o.source === 'qr' && !hasPrices}<p class="muted">
				Pieza de campaña repuesta desde el QR: se factura con la campaña.
			</p>{/if}

		{#if data.can.validate || data.can.advance || data.can.cancel}
			<div class="acts">
				{#if data.can.validate}
					<Button href="?confirmar=validar" variant="green" icon={Check} onclick={open('validar')}
						>Aceptar</Button
					>
					<Button href="?confirmar=rechazar" variant="red" icon={X} onclick={open('rechazar')}
						>Rechazar</Button
					>
				{/if}
				{#if data.can.advance}
					<Button href="?confirmar=avanzar" variant="primary" icon={Truck} onclick={open('avanzar')}
						>{ADVANCE_LABEL[o.state]}</Button
					>
				{/if}
				{#if data.can.cancel}
					<Button href="?confirmar=cancelar" variant="red" onclick={open('cancelar')}
						>Cancelar pedido</Button
					>
				{/if}
			</div>
		{/if}
	</section>

	<aside>
		<dl>
			<dt>Restaurante</dt>
			<dd>{o.restaurantName} <small class="mono">{o.restaurantId}</small></dd>
			<dt>Fecha</dt>
			<dd>{fmtDateTime(o.placedAt)}</dd>
			{#if o.note}<dt>Observaciones</dt>
				<dd>{o.note}</dd>{/if}
		</dl>
		<h3>Eventos</h3>
		<ol class="events">
			{#each events as e (e.text)}
				<li><small>{fmtDateTime(e.at)}</small><span>{e.text}</span></li>
			{/each}
		</ol>
	</aside>
</div>

{#if data.can.validate}
	<ConfirmDialog
		bind:this={dialogs.validar}
		id="validar"
		title="¿Aceptar el pedido {o.id}?"
		description="Pasa a preparación y se avisa al restaurante."
		confirmLabel="Aceptar"
		tone="green"
		action="?/validar"
		initiallyOpen={confirmar === 'validar'}
	/>
	<ConfirmDialog
		bind:this={dialogs.rechazar}
		id="rechazar"
		title="¿Rechazar el pedido {o.id}?"
		confirmLabel="Rechazar"
		tone="red"
		action="?/rechazar"
		initiallyOpen={confirmar === 'rechazar'}
	>
		<label class="field">
			<span>Motivo (lo verá el restaurante)</span>
			<textarea class="input area" name="motivo" required minlength="3" maxlength="500"></textarea>
		</label>
	</ConfirmDialog>
{/if}
{#if data.can.advance}
	<ConfirmDialog
		bind:this={dialogs.avanzar}
		id="avanzar"
		title="¿{ADVANCE_LABEL[o.state]} el pedido {o.id}?"
		description="Se avisa al restaurante."
		confirmLabel={ADVANCE_LABEL[o.state] ?? 'Avanzar'}
		action="?/avanzar"
		initiallyOpen={confirmar === 'avanzar'}
	/>
{/if}
{#if data.can.cancel}
	<ConfirmDialog
		bind:this={dialogs.cancelar}
		id="cancelar"
		title="¿Cancelar el pedido {o.id}?"
		description="Solo se puede antes de salir a reparto."
		confirmLabel="Cancelar pedido"
		tone="red"
		action="?/cancelar"
		initiallyOpen={confirmar === 'cancelar'}
	/>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	h2 {
		font-size: 18px;
		font-weight: 600;
		margin: 0;
	}
	h3 {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 8px;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 32px;
		align-items: start;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		padding: 8px 6px;
		border-bottom: 1px solid var(--line);
	}
	th {
		font-weight: 500;
		font-size: 12px;
		color: var(--muted);
	}
	tfoot th,
	tfoot td {
		font-weight: 600;
		color: var(--ink);
		border-bottom: 0;
	}
	.r {
		text-align: right;
	}
	small,
	.muted {
		font-size: 12px;
		color: var(--muted);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.tag {
		margin-left: 6px;
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 16px;
	}
	dl {
		display: grid;
		gap: 4px;
		margin: 0 0 20px;
		font-size: 14px;
	}
	dt {
		font-size: 12px;
		color: var(--muted);
	}
	dd {
		margin: 0 0 8px;
	}
	.events {
		list-style: none;
		margin: 0;
		padding: 0 0 0 12px;
		border-left: 1px solid var(--line);
		display: grid;
		gap: 10px;
		font-size: 13px;
	}
	.events li {
		display: grid;
	}
	.area {
		height: auto;
		min-height: 72px;
		padding: 8px 12px;
	}
	@media (max-width: 899px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
