<!--
	Recepción en el restaurante (8.6), pensada para el móvil del gerente: bultos que se marcan,
	«Confirmar recepción» a pantalla completa y «Abrir incidencia» con foto (obligatoria solo en la
	incidencia; ADR 0008). Sin cobertura, todo queda en la cola y se envía al volver la red.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import PackageCheck from '@lucide/svelte/icons/package-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Package from '@lucide/svelte/icons/package';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import FullscreenResult, { type Result } from '$components/domain/kits/FullscreenResult.svelte';
	import { KIT_STATES, KIT_TONE } from '$lib/domain/kits';
	import { fmtDateTime, fmtDay } from '$lib/domain/dates';
	import {
		CHANNEL,
		enqueue,
		flush,
		pending,
		requestSync,
		send,
		shrinkPhoto,
		type QueuedEvent
	} from '$lib/offline/queue';

	let { data, form } = $props();
	type Kit = (typeof data.pending)[number];
	// Bultos marcados por kit; los kits que lleguen al recargar se añaden vacíos.
	let checked = $state<Record<string, number[]>>({});
	const ensureChecked = () => {
		for (const k of data.pending) checked[k.id] ??= [];
	};
	ensureChecked(); // también en el servidor, donde los efectos no corren
	$effect.pre(ensureChecked);
	let incidentFor = $state<string | null>(null);
	let confirmFor = $state<Kit | null>(null);
	let result = $state<Result | null>(null);
	let queuedKits = $state<string[]>([]);
	let online = $state(true);
	let busy = $state(false);

	async function refresh() {
		try {
			queuedKits = (await pending()).map((e) => String(e.payload.kitId));
		} catch {
			queuedKits = [];
		}
	}

	onMount(() => {
		online = navigator.onLine;
		const on = async () => {
			online = true;
			const r = await flush();
			await refresh();
			if (r.sent) await invalidate('app:recepcion');
		};
		const off = () => (online = false);
		addEventListener('online', on);
		addEventListener('offline', off);
		let ch: BroadcastChannel | null = null;
		try {
			ch = new BroadcastChannel(CHANNEL);
			ch.onmessage = () => refresh();
		} catch {
			/* sin BroadcastChannel */
		}
		if (navigator.onLine) on();
		else refresh();
		return () => {
			removeEventListener('online', on);
			removeEventListener('offline', off);
			ch?.close();
		};
	});

	const all = (k: Kit) => Array.from({ length: k.parcels }, (_, i) => i + 1);
	const complete = (k: Kit) => (checked[k.id] ?? []).length === k.parcels;

	/** Envía el evento o, sin red, lo deja en la cola. */
	async function dispatch(ev: QueuedEvent, okTitle: string, okLine: string) {
		busy = true;
		try {
			const r = navigator.onLine
				? await send(ev)
				: ({ ok: false, offline: true, error: '' } as const);
			if (r.ok) {
				result = { tone: 'green', title: okTitle, lines: [okLine] };
				await invalidate('app:recepcion');
			} else if (r.offline) {
				await enqueue(ev);
				void requestSync();
				await refresh();
				result = {
					tone: 'amber',
					title: okTitle,
					lines: ['Sin conexión: guardado en el móvil', 'Se enviará al volver la cobertura']
				};
			} else result = { tone: 'red', title: 'No se ha podido', lines: [r.error] };
		} finally {
			busy = false;
		}
	}

	async function confirmReceive(k: Kit) {
		confirmFor = null;
		await dispatch(
			{
				clientId: crypto.randomUUID(),
				type: 'receive',
				at: new Date().toISOString(),
				payload: { kitId: k.id, parcels: checked[k.id] ?? [] },
				label: `${k.id} · recepción`
			},
			'Recepción confirmada',
			`${k.id} · ${k.parcels} ${k.parcels === 1 ? 'bulto' : 'bultos'}`
		);
	}

	async function submitIncident(e: SubmitEvent, k: Kit) {
		e.preventDefault();
		const f = new FormData(e.currentTarget as HTMLFormElement);
		const file = f.get('foto');
		if (!(file instanceof File) || !file.size) {
			result = { tone: 'red', title: 'Falta la foto', lines: ['La incidencia necesita una foto'] };
			return;
		}
		const photo = await shrinkPhoto(file);
		await dispatch(
			{
				clientId: crypto.randomUUID(),
				type: 'incident',
				at: new Date().toISOString(),
				payload: { kitId: k.id, kind: String(f.get('tipo')), text: String(f.get('texto') ?? '') },
				photo,
				label: `${k.id} · incidencia`
			},
			'Incidencia enviada',
			`${k.id} · ${f.get('tipo')}`
		);
		incidentFor = null;
	}
</script>

{#if !online}<p class="offline">
		<WifiOff size={16} strokeWidth={1.5} aria-hidden="true" /> Sin cobertura: lo que confirmes se guarda
		en el móvil.
	</p>{/if}
{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}

{#if data.pending.length}
	<div class="kits">
		{#each data.pending as k (k.id)}
			{@const inQueue = queuedKits.includes(k.id)}
			<article class="kit" id={k.id}>
				<header>
					<div>
						<b class="mono">{k.id}</b>
						<small>{k.campaignName} · en restaurante {fmtDay(k.inRestaurantOn)}</small>
					</div>
					{#if inQueue}<Chip tone="amber">En cola</Chip>{:else}<Chip tone={KIT_TONE[k.state]}
							>{KIT_STATES[k.state]}</Chip
						>{/if}
				</header>
				<form
					method="POST"
					action="?/recibir"
					class="check"
					onsubmit={(e) => {
						e.preventDefault();
						if (complete(k)) confirmFor = k;
					}}
				>
					<input type="hidden" name="kit" value={k.id} />
					<fieldset>
						<legend>Bultos recibidos</legend>
						{#each all(k) as n (n)}
							<label class="parcel"
								><input type="checkbox" name="bulto" value={n} bind:group={checked[k.id]} />Bulto {n}/{k.parcels}</label
							>
						{/each}
					</fieldset>
					<details class="lines">
						<summary
							>Contenido · {k.lines.length} {k.lines.length === 1 ? 'línea' : 'líneas'}</summary
						>
						<ul>
							{#each k.lines as l (l.id)}<li>
									<span>{l.label}</span><span class="mono">{l.versionCode}</span><span class="num"
										>{l.qty}</span
									>
								</li>{/each}
						</ul>
					</details>
					<div class="acts">
						<Button
							type="submit"
							variant="green"
							size={44}
							icon={PackageCheck}
							disabled={!complete(k) || busy || inQueue}>Confirmar recepción</Button
						>
						<Button
							type="button"
							variant="amber"
							size={44}
							icon={TriangleAlert}
							onclick={() => (incidentFor = incidentFor === k.id ? null : k.id)}
							disabled={inQueue}>Abrir incidencia</Button
						>
					</div>
				</form>
				{#if incidentFor === k.id || (form?.kit === k.id && form?.error)}
					<form
						method="POST"
						action="?/incidencia"
						enctype="multipart/form-data"
						class="incident"
						onsubmit={(e) => submitIncident(e, k)}
					>
						<input type="hidden" name="kit" value={k.id} />
						<label class="field"
							><span>Tipo</span><select class="input" name="tipo" required
								>{#each data.kinds as kind (kind)}<option>{kind}</option>{/each}</select
							></label
						>
						<label class="field"
							><span>Qué ha pasado</span><textarea
								class="input area"
								name="texto"
								required
								minlength="3"
								rows="3"></textarea></label
						>
						<label class="field"
							><span>Foto</span><input
								class="input file"
								type="file"
								name="foto"
								accept="image/*"
								capture="environment"
								required
							/></label
						>
						<Button type="submit" variant="amber" size={44} disabled={busy}
							>Enviar incidencia</Button
						>
					</form>
				{/if}
			</article>
		{/each}
	</div>
{:else}
	<EmptyState icon={Package} text="No hay kits en camino a tu restaurante." />
{/if}

{#if data.received.length}
	<section class="done">
		<h2>Recibidos</h2>
		<ul>
			{#each data.received as k (k.id)}<li>
					<span class="mono">{k.id}</span><span>{k.campaignName}</span><small
						>{fmtDateTime(k.receivedAt)}</small
					>
				</li>{/each}
		</ul>
	</section>
{/if}

{#if confirmFor}
	{@const k = confirmFor}
	<div class="confirm" role="dialog" aria-modal="true" aria-labelledby="conf-t">
		<PackageCheck size={64} strokeWidth={1.25} aria-hidden="true" />
		<h2 id="conf-t">¿Confirmar la recepción de {k.id}?</h2>
		<p>
			{k.parcels}
			{k.parcels === 1 ? 'bulto comprobado' : 'bultos comprobados'} · {k.campaignName}
		</p>
		<div class="acts">
			<Button variant="green" size={44} onclick={() => confirmReceive(k)}
				>Confirmar recepción</Button
			>
			<Button size={44} onclick={() => (confirmFor = null)}>Cancelar</Button>
		</div>
	</div>
{/if}
<FullscreenResult bind:result />

<style>
	.offline {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		margin-bottom: 12px;
		background: var(--amber-bg);
		color: var(--amber-ink);
		font-size: 13px;
	}
	.kits {
		display: grid;
		gap: 16px;
		max-width: 640px;
	}
	.kit {
		border-top: 1px solid var(--line);
		padding-top: 12px;
		display: grid;
		gap: 12px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
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
	.mono {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	legend {
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 6px;
	}
	.parcel {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 2px;
	}
	.parcel:has(input:checked) {
		border-color: var(--green);
		background: color-mix(in srgb, var(--green) 10%, transparent);
	}
	.parcel input {
		width: 20px;
		height: 20px;
	}
	.lines summary {
		font-size: 13px;
		color: var(--muted);
		cursor: pointer;
		min-height: 32px;
	}
	.lines ul {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}
	.lines li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 40px;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
	}
	.lines .num {
		text-align: right;
	}
	.check,
	.incident {
		display: grid;
		gap: 12px;
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.incident {
		padding: 12px;
		border-left: 2px solid var(--amber);
		background: var(--surface);
	}
	.area {
		height: auto;
		padding: 8px 12px;
	}
	.file {
		height: auto;
		padding: 8px;
	}
	.done {
		margin-top: 32px;
		max-width: 640px;
	}
	.done h2 {
		margin-bottom: 8px;
	}
	.done ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	.done li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
		align-items: center;
	}
	.confirm {
		position: fixed;
		inset: 0;
		z-index: 75;
		background: var(--bg);
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 16px;
		padding: 24px;
		text-align: center;
		color: var(--green);
	}
	.confirm h2 {
		font-size: 22px;
		color: var(--ink);
	}
	.confirm p {
		color: var(--muted);
	}
	@media (max-width: 767px) {
		.acts :global(.b) {
			flex: 1;
		}
	}
</style>
