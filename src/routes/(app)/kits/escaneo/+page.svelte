<!--
	Escaneo de kits (8.6): pantalla completa, pistola (escribe el código y Enter en el campo) o cámara
	(BarcodeDetector del navegador, o zxing-wasm si no lo tiene, cargado solo aquí). Cada lectura se
	confirma a pantalla completa; sin cobertura se guarda en la cola y se envía al volver la red.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import Camera from '@lucide/svelte/icons/camera';
	import CameraOff from '@lucide/svelte/icons/camera-off';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Button from '$components/ui/Button.svelte';
	import FullscreenResult, { type Result } from '$components/domain/kits/FullscreenResult.svelte';
	import { parseKitCode, STEP_LABEL, type ScanStep } from '$lib/domain/kits';
	import {
		CHANNEL,
		enqueue,
		flush,
		pending,
		requestSync,
		send,
		type QueuedEvent
	} from '$lib/offline/queue';

	let { data, form } = $props();
	let step = $derived<ScanStep>(data.step);
	let code = $state('');
	let input: HTMLInputElement | undefined = $state();
	let result = $state<Result | null>(null);
	let queued = $state(0);
	let online = $state(true);
	type Line = {
		id: string;
		kitId: string;
		step: ScanStep;
		status: 'ok' | 'ya' | 'cola' | 'error';
		text: string;
		at: Date;
	};
	let session = $state<Line[]>([]);

	let video: HTMLVideoElement | undefined = $state();
	let stream: MediaStream | null = $state(null);
	let cameraError = $state<string | null>(null);
	let lastRead = { text: '', at: 0 };

	async function refreshQueue() {
		try {
			queued = (await pending()).filter((e) => !e.error).length;
		} catch {
			queued = 0;
		}
	}

	onMount(() => {
		online = navigator.onLine;
		const on = async () => {
			online = true;
			await flush();
			await refreshQueue();
		};
		const off = () => (online = false);
		addEventListener('online', on);
		addEventListener('offline', off);
		let channel: BroadcastChannel | null = null;
		try {
			channel = new BroadcastChannel(CHANNEL);
			channel.onmessage = () => refreshQueue();
		} catch {
			/* sin BroadcastChannel */
		}
		if (navigator.onLine) flush().then(refreshQueue);
		else refreshQueue();
		input?.focus();
		return () => {
			removeEventListener('online', on);
			removeEventListener('offline', off);
			channel?.close();
			stopCamera();
		};
	});

	async function process(text: string) {
		const parsed = parseKitCode(text);
		if (!parsed) {
			result = { tone: 'red', title: 'Código no válido', lines: [text.slice(0, 40)] };
			return;
		}
		const ev: QueuedEvent = {
			clientId: crypto.randomUUID(),
			type: 'scan',
			at: new Date().toISOString(),
			payload: { kitId: parsed.kitId, step, source: 'scanner' },
			label: `${parsed.kitId} · ${STEP_LABEL[step]}`
		};
		const line = (status: Line['status'], t: string) =>
			(session = [
				{ id: ev.clientId, kitId: parsed.kitId, step, status, text: t, at: new Date() },
				...session
			].slice(0, 50));
		const r = navigator.onLine
			? await send(ev)
			: ({ ok: false, offline: true, error: '' } as const);
		if (r.ok) {
			const d = r.data as { restaurant: string; label: string; already: boolean };
			result = {
				tone: d.already ? 'amber' : 'green',
				title: parsed.kitId,
				lines: [d.restaurant, d.already ? `${d.label}: ya constaba` : d.label]
			};
			line(d.already ? 'ya' : 'ok', d.restaurant);
		} else if (r.offline) {
			await enqueue(ev);
			void requestSync();
			await refreshQueue();
			result = {
				tone: 'amber',
				title: parsed.kitId,
				lines: ['Sin conexión: guardado', `${STEP_LABEL[step]} · se enviará al volver la red`]
			};
			line('cola', 'Pendiente de enviar');
		} else {
			result = { tone: 'red', title: parsed.kitId, lines: [r.error] };
			line('error', r.error);
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const text = code.trim();
		code = '';
		if (text) await process(text);
		input?.focus();
	}

	/* ---------- Cámara ---------- */

	type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
	let detector: Detector | null = null;
	let raf = 0;

	async function zxingDetector(): Promise<Detector> {
		const [{ prepareZXingModule, readBarcodes }, wasm] = await Promise.all([
			import('zxing-wasm/reader'),
			import('zxing-wasm/reader/zxing_reader.wasm?url')
		]);
		prepareZXingModule({ overrides: { locateFile: () => wasm.default }, fireImmediately: true });
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		return {
			async detect(src) {
				const v = src as HTMLVideoElement;
				canvas.width = v.videoWidth;
				canvas.height = v.videoHeight;
				ctx.drawImage(v, 0, 0);
				const found = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
					formats: ['QRCode', 'Code128', 'DataMatrix'],
					maxNumberOfSymbols: 1
				});
				return found.map((f) => ({ rawValue: f.text }));
			}
		};
	}

	async function startCamera() {
		cameraError = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
			const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector })
				.BarcodeDetector;
			detector = BD
				? new BD({ formats: ['qr_code', 'code_128', 'data_matrix'] })
				: await zxingDetector();
			await new Promise((r) => requestAnimationFrame(r));
			video!.srcObject = stream;
			await video!.play();
			loop();
		} catch (e) {
			cameraError =
				(e as Error).name === 'NotAllowedError'
					? 'Sin permiso para usar la cámara'
					: 'No se puede abrir la cámara';
			stopCamera();
		}
	}

	function stopCamera() {
		cancelAnimationFrame(raf);
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
	}

	let busy = false;
	function loop() {
		raf = requestAnimationFrame(async () => {
			if (!stream || !video || !detector) return;
			if (!busy && !result && video.readyState >= 2) {
				busy = true;
				try {
					const [hit] = await detector.detect(video);
					// La misma etiqueta delante de la cámara no se registra dos veces seguidas.
					if (hit && (hit.rawValue !== lastRead.text || Date.now() - lastRead.at > 4000)) {
						lastRead = { text: hit.rawValue, at: Date.now() };
						await process(hit.rawValue);
					}
				} catch {
					/* fotograma ilegible */
				}
				busy = false;
			}
			loop();
		});
	}

	const STATUS_ICON = { ok: Check, ya: Check, cola: WifiOff, error: CircleAlert };
</script>

<div class="scanner">
	<header>
		<Button href="/kits" variant="ghost" icon={X} label="Salir del escaneo" />
		<h2>Escaneo</h2>
		{#if !online}<span class="chip off"
				><WifiOff size={14} strokeWidth={1.5} aria-hidden="true" />Sin conexión</span
			>{/if}
		{#if queued}<span class="chip q" aria-live="polite">{queued} en cola</span>{/if}
	</header>

	<form method="POST" action="?/escanear" class="read" onsubmit={submit}>
		<fieldset class="steps">
			<legend class="sr-only">Paso que se registra</legend>
			{#each data.steps as s (s)}
				<label class:on={step === s}
					><input type="radio" name="paso" value={s} bind:group={step} />{STEP_LABEL[s]}</label
				>
			{/each}
		</fieldset>
		<label class="field">
			<span>Código del kit (pistola o teclado)</span>
			<input
				bind:this={input}
				class="input mono"
				name="codigo"
				bind:value={code}
				autocomplete="off"
				autocapitalize="characters"
				enterkeyhint="send"
				placeholder="K-FH2607-0147"
			/>
		</label>
		<div class="row">
			<Button type="submit" variant="primary">Registrar</Button>
			{#if stream}
				<Button type="button" icon={CameraOff} onclick={stopCamera}>Parar cámara</Button>
			{:else}
				<Button type="button" icon={Camera} onclick={startCamera}>Usar la cámara</Button>
			{/if}
		</div>
		{#if cameraError}<p class="field-error">{cameraError}</p>{/if}
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		{#if form?.result}<p class="ok" role="status">
				{form.result.kitId} · {form.result.restaurant} · {form.result.label}{form.result.already
					? ' (ya constaba)'
					: ''}
			</p>{/if}
	</form>

	{#if stream}
		<div class="cam">
			<video bind:this={video} playsinline muted></video>
			<div class="guide" aria-hidden="true"></div>
		</div>
	{/if}

	<section class="log" aria-label="Escaneos de esta sesión">
		{#each session as l (l.id)}
			{@const Icon = STATUS_ICON[l.status]}
			<div class="line {l.status}">
				<Icon size={16} strokeWidth={1.5} aria-hidden="true" />
				<span class="mono">{l.kitId}</span>
				<span class="t">{STEP_LABEL[l.step]} · {l.text}</span>
			</div>
		{:else}
			<p class="muted">Apunta la pistola al campo o usa la cámara.</p>
		{/each}
	</section>
</div>

<FullscreenResult bind:result />

<style>
	.scanner {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		overflow: auto;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		height: var(--top);
		padding: 0 16px 0 8px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	h2 {
		flex: 1;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 24px;
		padding: 0 8px;
		border-radius: 2px;
		font-size: 12px;
	}
	.off,
	.q {
		background: var(--amber-bg);
		color: var(--amber-ink);
	}
	.read {
		display: grid;
		gap: 12px;
		padding: 16px;
		max-width: 560px;
		width: 100%;
		margin: 0 auto;
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
		border: 1px solid var(--line);
		border-radius: 2px;
		padding: 0;
		margin: 0;
	}
	.steps label {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		display: grid;
		place-items: center;
		padding: 0 8px;
		font-weight: 500;
		color: var(--muted);
		text-align: center;
		cursor: pointer;
	}
	.steps label + label {
		border-left: 1px solid var(--line);
	}
	.steps label.on {
		background: var(--seg-on);
		color: var(--seg-on-ink);
	}
	.steps input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ok {
		color: var(--green);
		font-size: 13px;
	}
	.cam {
		position: relative;
		width: min(560px, 100%);
		margin: 0 auto;
		aspect-ratio: 4 / 3;
		background: #000;
	}
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.guide {
		position: absolute;
		inset: 18% 22%;
		border: 2px solid #fff;
		outline: 100vmax solid rgb(0 0 0 / 0.35);
	}
	.cam {
		overflow: hidden;
	}
	.log {
		max-width: 560px;
		width: 100%;
		margin: 0 auto;
		padding: 0 16px 24px;
		display: grid;
		gap: 0;
	}
	.line {
		display: grid;
		grid-template-columns: 16px auto minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: 10px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
	}
	.line .t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.line.ok :global(svg),
	.line.ya :global(svg) {
		color: var(--green);
	}
	.line.cola :global(svg) {
		color: var(--amber);
	}
	.line.error :global(svg) {
		color: var(--red);
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
		padding: 12px 0;
	}
</style>
