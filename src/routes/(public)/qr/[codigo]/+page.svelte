<!--
	Landing pública del QR de versión (8.7): una pantalla, sin sesión. Dice si la pieza sigue
	vigente y ofrece tres acciones grandes. Los pedidos nacen «pendientes de validar».
-->
<script lang="ts">
	import { page } from '$app/state';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import MessageSquareWarning from '@lucide/svelte/icons/message-square-warning';
	import Ban from '@lucide/svelte/icons/ban';
	import Button from '$components/ui/Button.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { fmtDay } from '$lib/domain/dates';

	let { data, form } = $props();
	const q = $derived(data.q);
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	const STATE = {
		vigente: ['Vigente', 'Esta es la versión en uso.', 'green'],
		sustituida: ['Sustituida', 'Hay una versión más reciente: hay que cambiar esta pieza.', 'red'],
		retirada: ['Retirada', 'Esta pieza ya se marcó como retirada.', 'muted'],
		pendiente: ['Pendiente de aprobar', 'Esta versión aún no está aprobada.', 'amber']
	} as const;
	const st = $derived(STATE[q.state]);
	function ask(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}
</script>

<section class="state {st[2]}" aria-live="polite">
	{#if q.state === 'vigente'}<CircleCheck
			size={48}
			strokeWidth={1.5}
			aria-hidden="true"
		/>{:else}<CircleAlert size={48} strokeWidth={1.5} aria-hidden="true" />{/if}
	<h1>
		{st[0]}{#if q.since && q.state !== 'vigente'}&nbsp;el {fmtDay(q.since.toISOString())}{/if}
	</h1>
	<p>{st[1]}</p>
</section>

<dl>
	<dt>Pieza</dt>
	<dd>{q.support}</dd>
	<dt>Versión</dt>
	<dd class="mono">{q.versionCode}</dd>
	<dt>Campaña</dt>
	<dd>{q.campaign} · {q.brand}</dd>
	{#if q.restaurant}<dt>Restaurante</dt>
		<dd>{q.restaurant}</dd>{/if}
	<dt>Lote</dt>
	<dd class="mono">{q.batch} · {q.code}</dd>
</dl>

{#if form?.done}
	<p class="done" role="status">
		{#if form.done === 'reponer'}Pedido {form.ref} enviado. Promopicking lo valida y te llegará con la
			próxima ruta.
		{:else if form.done === 'error'}Aviso {form.ref} enviado a Promopicking.
		{:else}Pieza marcada como retirada.{/if}
	</p>
{/if}
{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}

<div class="acts">
	<Button
		href="?confirmar=reponer"
		variant="primary"
		size={44}
		icon={ShoppingCart}
		onclick={(e: MouseEvent) => ask(e, 'reponer')}>Pedir reposición</Button
	>
	<Button
		href="?confirmar=error"
		variant="amber"
		size={44}
		icon={MessageSquareWarning}
		onclick={(e: MouseEvent) => ask(e, 'error')}>Avisar de un error</Button
	>
	{#if q.state !== 'retirada'}
		<Button
			href="?confirmar=retirar"
			variant="red"
			size={44}
			icon={Ban}
			onclick={(e: MouseEvent) => ask(e, 'retirar')}>Marcar retirada</Button
		>
	{/if}
</div>

<ConfirmDialog
	bind:this={dialogs['reponer']}
	id="reponer"
	title="¿Pedir reposición de {q.support}?"
	description="Versión {q.versionCode}{q.restaurant
		? ` para ${q.restaurant}`
		: ''}. Queda pendiente de validar."
	confirmLabel="Pedir"
	action="?/reponer"
	initiallyOpen={confirmar === 'reponer'}
>
	<label class="field"
		><span>Unidades</span><input
			class="input"
			type="number"
			name="cantidad"
			min="1"
			max="50"
			value="1"
			required
		/></label
	>
</ConfirmDialog>
<ConfirmDialog
	bind:this={dialogs['error']}
	id="error"
	title="¿Qué está mal en esta pieza?"
	confirmLabel="Enviar aviso"
	tone="amber"
	action="?/error"
	initiallyOpen={confirmar === 'error'}
>
	<label class="field"
		><span>Motivo</span><select class="input" name="motivo"
			>{#each data.reasons as r (r)}<option>{r}</option>{/each}</select
		></label
	>
	<label class="field"
		><span>Detalle (opcional)</span><textarea
			class="input area"
			name="texto"
			rows="3"
			maxlength="1000"></textarea></label
	>
</ConfirmDialog>
<ConfirmDialog
	bind:this={dialogs['retirar']}
	id="retirar"
	title="¿Marcar esta pieza como retirada?"
	description="Promopicking verá que ya no está en el restaurante."
	confirmLabel="Marcar retirada"
	tone="red"
	action="?/retirar"
	initiallyOpen={confirmar === 'retirar'}
/>

<style>
	.state {
		display: grid;
		justify-items: start;
		gap: 8px;
		padding: 20px;
		border-left: 3px solid currentColor;
	}
	.green {
		color: var(--green);
		background: color-mix(in srgb, var(--green) 8%, transparent);
	}
	.red {
		color: var(--red);
		background: color-mix(in srgb, var(--red) 8%, transparent);
	}
	.amber {
		color: var(--amber-ink);
		background: var(--amber-bg);
	}
	.muted {
		color: var(--muted);
		background: var(--line-soft);
	}
	h1 {
		color: var(--ink);
	}
	.state p {
		color: var(--ink);
	}
	dl {
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr);
		gap: 8px 12px;
		margin: 24px 0;
		font-size: 14px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.acts {
		display: grid;
		gap: 8px;
	}
	.acts :global(.b) {
		width: 100%;
	}
	.done {
		padding: 12px;
		border-left: 2px solid var(--green);
		background: color-mix(in srgb, var(--green) 8%, transparent);
		margin-bottom: 16px;
	}
	.area {
		height: auto;
		padding: 8px 12px;
	}
</style>
