<!-- Trazabilidad del kit (8.6): estados con su hora, eventos, contenido y etiquetas. -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Check from '@lucide/svelte/icons/check';
	import Printer from '@lucide/svelte/icons/printer';
	import ScanLine from '@lucide/svelte/icons/scan-line';
	import PackageCheck from '@lucide/svelte/icons/package-check';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { EVENT_LABEL, KIT_STATES, KIT_TONE, STEP_LABEL } from '$lib/domain/kits';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data } = $props();
	const k = $derived(data.kit);
	let dialog: ConfirmDialog | undefined = $state();
	const ORDER = ['prepared', 'shipped', 'hub_in', 'out_for_delivery', 'received'] as const;
	const SOURCE = { web: 'Web', scanner: 'Lector', mobile: 'Móvil', qr: 'QR' } as const;
	/** Si llegó al servidor más de 2 min después de escanearse, vino de la cola sin conexión. */
	const late = (e: { at: Date; recordedAt: Date }) =>
		new Date(e.recordedAt).getTime() - new Date(e.at).getTime() > 120_000;
</script>

<div class="head">
	<Button
		href="/kits?campana={k.campaignId}"
		variant="ghost"
		icon={ChevronLeft}
		label="Volver a los kits"
	/>
	<span class="id">{k.id}</span>
	<Chip tone={KIT_TONE[k.state]}>{KIT_STATES[k.state]}</Chip>
	{#if k.incidentTicketId}<Chip tone="red">{k.incidentTicketId}</Chip>{/if}
	<div class="spacer"></div>
	{#if data.canScan && data.next}
		<Button
			href="?confirmar=1"
			variant="primary"
			icon={ScanLine}
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				dialog?.show();
			}}>{STEP_LABEL[data.next]}</Button
		>
		<ConfirmDialog
			bind:this={dialog}
			id="registrar"
			title="¿Registrar {STEP_LABEL[data.next].toLowerCase()}?"
			description="{k.restaurantName} · queda con tu nombre y la hora de ahora."
			confirmLabel="Registrar"
			action="/kits?/registrar"
			fields={{ kit: k.id, paso: data.next }}
		/>
	{/if}
	{#if data.canReceive}<Button href="/kits/recepcion#{k.id}" variant="green" icon={PackageCheck}
			>Recepción</Button
		>{/if}
	<Button
		href="/kits/etiquetas?kit={k.id}"
		variant="ghost"
		icon={Printer}
		label="Imprimir etiquetas"
		tipPos="left"
	/>
</div>
<p class="meta">
	{k.restaurantName} · {k.address} · {k.campaignName} ({k.campaignId}) · {k.parcels}
	{k.parcels === 1 ? 'bulto' : 'bultos'} · entrega: {k.deliveryPoint}
</p>

<ol class="trace" aria-label="Trazabilidad">
	{#each ORDER as type, i (type)}
		{@const ev = k.events.find((e) => e.type === type)}
		<li class:done={k.state >= i} class:current={k.state === i}>
			<span class="n"
				>{#if k.state > i || (k.state === 4 && i === 4)}<Check
						size={14}
						strokeWidth={2}
						aria-label="Hecho"
					/>{:else}{i + 1}{/if}</span
			>
			<span class="l">{KIT_STATES[i]}</span>
			<span class="d num">{ev ? fmtDateTime(ev.at) : '—'}</span>
		</li>
	{/each}
</ol>

<div class="grid">
	<section>
		<h2>Eventos</h2>
		<ul class="list">
			{#each k.events as e (e.id)}
				<li>
					<div class="grow">
						<b>{EVENT_LABEL[e.type]}</b>
						<small
							>{fmtDateTime(e.at)} · {e.who ?? '—'} · {SOURCE[e.source]}{#if late(e)}
								· <span class="off"
									><WifiOff size={12} strokeWidth={1.5} aria-hidden="true" /> sin conexión, llegó {fmtDateTime(
										e.recordedAt
									)}</span
								>{/if}</small
						>
						{#if e.detail && 'text' in e.detail}<p>{String(e.detail.text)}</p>{/if}
					</div>
					{#if e.photoUrl}<a href={e.photoUrl} target="_blank" rel="noopener"
							><img
								src={e.photoUrl}
								alt="Foto de {EVENT_LABEL[e.type].toLowerCase()}"
								width="64"
								height="64"
							/></a
						>{/if}
				</li>
			{/each}
		</ul>
	</section>
	<section>
		<h2>Contenido</h2>
		<ul class="list">
			{#each k.lines as l (l.id)}
				<li>
					<div class="grow"><b>{l.label}</b><small class="mono">{l.versionCode}</small></div>
					<span class="num">{l.qty} uds</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 8px 12px;
		flex-wrap: wrap;
	}
	.head :global(.b:first-child) {
		margin-left: -8px;
	}
	.spacer {
		flex: 1;
	}
	.id,
	.mono {
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
	}
	.meta {
		color: var(--muted);
		font-size: 13px;
		padding: 8px 0 16px;
		border-bottom: 1px solid var(--line);
	}
	.trace {
		list-style: none;
		margin: 0;
		padding: 20px 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
		border-bottom: 1px solid var(--line);
	}
	.trace li {
		display: grid;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
		padding-top: 8px;
		border-top: 2px solid var(--line);
		min-width: 0;
	}
	.trace .done {
		border-top-color: var(--ink);
		color: var(--ink);
	}
	.trace .current {
		font-weight: 500;
	}
	.n {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		font-size: 11px;
		font-weight: 600;
	}
	.done .n {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 40px;
		padding-top: 24px;
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
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	b {
		display: block;
		font-weight: 500;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.off {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--amber-ink);
	}
	img {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border: 1px solid var(--line);
	}
	p {
		font-size: 13px;
		margin-top: 4px;
	}
	@media (max-width: 767px) {
		.trace {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.trace li {
			grid-template-columns: 22px minmax(0, 1fr) auto;
			align-items: center;
			gap: 12px;
			border-top: 0;
			border-left: 2px solid var(--line);
			padding: 6px 0 6px 12px;
			font-size: 13px;
		}
		.trace .done {
			border-left-color: var(--ink);
		}
		.grid {
			grid-template-columns: 1fr;
			gap: 24px;
		}
	}
</style>
