<!--
	Aprobación de artes finales (8.5), según la maqueta b-lamina-aprobacion.html:
	tres columnas en escritorio (soportes → versiones → visor); en tablet, dos columnas y el visor a
	pantalla completa; en móvil, pantallas encadenadas con las acciones en una barra inferior.
	El estado vive en la URL (?soporte=&version=&pagina=&comparar).
-->
<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult } from '@sveltejs/kit';
	import Check from '@lucide/svelte/icons/check';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import ZoomOut from '@lucide/svelte/icons/zoom-out';
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Send from '@lucide/svelte/icons/send';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import { useToaster } from '$components/ui/toast.svelte';
	import UploadDrawer from '$components/domain/approval/UploadDrawer.svelte';
	import Viewer from '$components/domain/approval/Viewer.svelte';
	import { faceLabel } from '$lib/domain/artwork';
	import { fmtDateTime, fmtSize } from '$lib/domain/dates';

	let { data, form: rawForm } = $props();
	const form = $derived(
		rawForm as {
			decision?: { error?: string };
			comment?: { error?: string };
			upload?: { error?: string };
		} | null
	);
	const toaster = useToaster();

	const STATUS = {
		pending: ['Pendiente', 'amber'],
		approved: ['Aprobada', 'green'],
		changes: ['Cambios pedidos', 'red']
	} as const;

	function href(changes: Record<string, string | null>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		const s = p.toString();
		return s ? `?${s}` : page.url.pathname;
	}

	const supports = $derived(
		data.supportFilter === 'pendientes' ? data.supports.filter((s) => s.pending > 0) : data.supports
	);
	const totalPending = $derived(data.supports.reduce((n, s) => n + s.pending, 0));
	const versions = $derived(
		data.versionFilter === 'pendientes'
			? data.versions.filter((v) => v.status !== 'approved')
			: data.versions
	);
	const waiting = $derived(data.versions.filter((v) => v.status === 'pending'));
	const changesCount = $derived(data.versions.filter((v) => v.status === 'changes').length);
	const view = $derived(data.view);
	const support = $derived(data.support);

	// Visor: cara o página, zoom, comparación y comentario anclado.
	let current = $derived(data.page);
	let zoom = $state<100 | 150 | 200>(100);
	let anchorMode = $state(false);
	let anchor = $state<{ page: number; x: number; y: number } | null>(null);
	const pins = $derived(
		(view?.comments ?? [])
			.filter((c) => c.x !== null)
			.map((c, i) => ({ n: i + 1, page: c.page, x: c.x, y: c.y, author: c.author, id: c.id }))
	);
	const faceName = $derived(
		view ? faceLabel(support?.artworkFormat ?? null, current, view.pages.length) : ''
	);

	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	let uploadDrawer: UploadDrawer | undefined = $state();
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	function ask(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}

	// Escritorio: al elegir un soporte se abre su primera versión pendiente.
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) return;
		if (!support && supports.length) {
			goto(href({ soporte: supports[0]!.id, version: null }), {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
		} else if (support && !view && data.versions.length) {
			const first = data.versions.find((v) => v.status !== 'approved') ?? data.versions[0]!;
			goto(href({ version: first.id }), { replaceState: true, noScroll: true, keepFocus: true });
		}
	});

	$effect(() => {
		// Al cambiar de versión se vuelve a la primera cara y sin zoom.
		void view?.id;
		zoom = 100;
		anchor = null;
		anchorMode = false;
	});

	async function undo(versionId: string) {
		const body = new FormData();
		body.set('version', versionId);
		const res = await fetch('?/deshacer', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const r = deserialize(await res.text());
		toaster.show(r.type === 'success' ? 'Aprobación deshecha' : 'Ya no se puede deshacer', {
			tone: r.type === 'success' ? 'amber' : 'red'
		});
		await invalidate('app:aprobaciones');
	}

	function approved(result: ActionResult) {
		if (result.type !== 'success') return;
		const d = result.data as { approved?: string; undo?: string };
		if (d?.approved && d.undo) {
			const id = d.undo;
			toaster.show(`${d.approved} aprobada`, { tone: 'green', undo: () => undo(id) });
		}
	}

	const faces = $derived(
		view
			? view.pages.map((p) => ({
					href: href({ pagina: String(p.page) }),
					label: faceLabel(support?.artworkFormat ?? null, p.page, view.pages.length),
					active: p.page === current
				}))
			: []
	);
	const supportItems = $derived([
		{
			href: href({ filtro: null }),
			label: 'Pendientes',
			active: data.supportFilter === 'pendientes'
		},
		{ href: href({ filtro: 'todas' }), label: 'Todos', active: data.supportFilter === 'todas' }
	]);
	const versionItems = $derived([
		{
			href: href({ vf: null }),
			label: 'Todas',
			active: data.versionFilter === 'todas',
			count: data.versions.length
		},
		{
			href: href({ vf: 'pendientes' }),
			label: 'Pendientes',
			active: data.versionFilter === 'pendientes',
			count: data.versions.length - data.versions.filter((v) => v.status === 'approved').length
		}
	]);
</script>

<div class="apr" data-step={data.step}>
	<section class="col col-sop" aria-label="Soportes">
		<div class="col-h">
			<div><b>Soportes</b><small>{totalPending} versiones pendientes</small></div>
		</div>
		<div class="col-sub">
			<Segmented size="mini" label="Filtro de soportes" items={supportItems} />
		</div>
		<div class="col-b">
			{#each supports as s (s.id)}
				<a
					class="row"
					class:sel={support?.id === s.id}
					href={href({ soporte: s.id, version: null, pagina: null, comparar: null })}
					aria-current={support?.id === s.id ? 'true' : undefined}
					data-sveltekit-noscroll
				>
					<div>
						<b>{s.name}</b>
						<small
							>{s.campaignName} · <span class="mono">{s.campaignId}</span> · {s.total} versiones</small
						>
					</div>
					{#if s.pending}<span class="count warn">{s.pending}</span>{/if}
				</a>
			{:else}
				<p class="empty">
					{data.supportFilter === 'pendientes'
						? 'Nada pendiente de aprobar.'
						: 'No hay artes en tu ámbito.'}
				</p>
			{/each}
		</div>
	</section>

	<section class="col col-ver" aria-label="Versiones">
		{#if support}
			<div class="col-h">
				<a class="back" href={href({ soporte: null, version: null })} aria-label="Volver a soportes"
					><ChevronLeft size={20} strokeWidth={1.5} /></a
				>
				<div>
					<b>{support.name}</b>
					<small
						>{[
							support.artworkLabel,
							support.artworkPrevLabel ? `anterior ${support.artworkPrevLabel}` : null,
							support.campaignName
						]
							.filter(Boolean)
							.join(' · ')}</small
					>
				</div>
				<div class="spacer"></div>
				{#if data.canDecide && waiting.length}
					<Button
						href={href({ confirmar: 'todas' })}
						variant="green"
						icon={CheckCheck}
						label="Aprobar las {waiting.length} pendientes"
						onclick={(e: MouseEvent) => ask(e, 'todas')}
					/>
				{/if}
				<Button
					href="/aprobaciones/acta/{support.id}"
					variant="ghost"
					icon={FileText}
					label="Acta de aprobación (PDF)"
				/>
				{#if data.canUpload}
					<Button
						href={href({ subir: '1' })}
						variant="primary"
						icon={Upload}
						label="Subir artes finales"
						tipPos="left"
						onclick={(e: MouseEvent) => {
							e.preventDefault();
							uploadDrawer?.show();
						}}
					/>
				{/if}
			</div>
			<div class="col-sub">
				<Segmented size="mini" label="Filtro de versiones" items={versionItems} />
			</div>
			<div class="col-b">
				{#each versions as v (v.id)}
					{@const st = STATUS[v.status]}
					<a
						class="vrow"
						class:sel={view?.id === v.id}
						href={href({ version: v.id, pagina: null, comparar: null })}
						aria-current={view?.id === v.id ? 'true' : undefined}
						data-sveltekit-noscroll
					>
						<span class="code mono"
							>{v.code}{#if v.revision > 1}<span class="rev">rev. {v.revision}</span>{/if}</span
						>
						<span class="kits num"
							>{v.kitsCount === null
								? ''
								: `${v.kitsCount} ${v.kitsCount === 1 ? 'kit' : 'kits'}`}</span
						>
						<span title={v.decidedBy ? `${v.decidedBy} · ${fmtDateTime(v.decidedAt)}` : undefined}
							><Chip tone={st[1]}>{st[0]}</Chip></span
						>
					</a>
				{/each}
			</div>
		{:else}
			<EmptyState icon={FileCheck} text="Elige un soporte." />
		{/if}
	</section>

	<section class="col col-vis" aria-label="Visor">
		{#if view && support}
			{@const st = STATUS[view.status]}
			<div class="col-h vis-h">
				<a
					class="back"
					href={href({ version: null, pagina: null, comparar: null })}
					aria-label="Volver a versiones"><ChevronLeft size={20} strokeWidth={1.5} /></a
				>
				<div>
					<b class="code mono">{view.code}</b>
					<small
						>rev. {view.revision}{view.kitsCount !== null ? ` · ${view.kitsCount} kits` : ''} · <Chip
							tone={st[1]}>{st[0]}</Chip
						></small
					>
				</div>
				<div class="spacer"></div>
				<div class="acts" role="group" aria-label="Acciones de la versión">
					{#if view.canDecide}
						<Button
							href={href({ confirmar: 'aprobar' })}
							variant="green"
							icon={Check}
							label="Aprobar {view.code}"
							disabled={view.status === 'approved'}
							onclick={(e: MouseEvent) => ask(e, 'aprobar')}
						/>
						<Button
							href={href({ confirmar: 'cambios' })}
							variant="amber"
							icon={Undo2}
							label="Pedir cambios"
							disabled={view.status === 'changes'}
							onclick={(e: MouseEvent) => ask(e, 'cambios')}
						/>
						<Button
							href={href({ confirmar: 'reabrir' })}
							variant="amber"
							icon={RotateCcw}
							label="Reabrir"
							disabled={view.status === 'pending'}
							onclick={(e: MouseEvent) => ask(e, 'reabrir')}
						/>
					{/if}
					{#if view.downloadUrl}
						<Button
							href={view.downloadUrl}
							variant="ghost"
							icon={Download}
							label="Descargar PDF"
							tipPos="left"
						/>
					{/if}
				</div>
			</div>
			<div class="toolbar">
				{#if faces.length > 1}<Segmented
						size="mini"
						label="Cara"
						items={faces.map((f) => ({ ...f }))}
					/>{/if}
				<div class="spacer"></div>
				<Button
					variant="ghost"
					icon={ZoomOut}
					label="Reducir"
					disabled={zoom === 100}
					onclick={() => (zoom = zoom === 200 ? 150 : 100)}
				/>
				<Button
					variant="ghost"
					icon={ZoomIn}
					label="Ampliar"
					disabled={zoom === 200}
					onclick={() => (zoom = zoom === 100 ? 150 : 200)}
				/>
				{#if view.prev}
					<Button
						href={href({ comparar: data.compare ? null : '1' })}
						variant={data.compare ? 'primary' : 'ghost'}
						icon={Columns2}
						label="Comparar con la rev. {view.prev.revision}"
						aria-pressed={data.compare}
					/>
				{/if}
				{#if view.canComment}
					<Button
						variant={anchorMode ? 'primary' : 'ghost'}
						icon={MapPin}
						label="Comentar en un punto"
						tipPos="left"
						aria-pressed={anchorMode}
						onclick={() => {
							anchorMode = !anchorMode;
							if (!anchorMode) anchor = null;
						}}
					/>
				{/if}
			</div>
			<Viewer
				code={view.code}
				pages={view.pages}
				prev={view.prev}
				revision={view.revision}
				{current}
				{faceName}
				compare={data.compare}
				{zoom}
				{pins}
				{anchorMode}
				{anchor}
				onanchor={(a) => (anchor = a)}
			/>
			<section class="comments" aria-label="Comentarios">
				{#each view.comments as c (c.id)}
					{@const pin = pins.find((p) => p.id === c.id)}
					<div class="cm">
						{#if pin}<span class="pin">{pin.n}</span>{:else}<span class="n" aria-hidden="true"
							></span>{/if}
						<header><b>{c.author}</b><time>{fmtDateTime(c.at)}</time></header>
						<p>{c.text}</p>
					</div>
				{/each}
				{#if view.canComment}
					<form
						method="POST"
						action="?/comentar"
						class="cm-form"
						use:enhance={() =>
							async ({ result, update }) => {
								await update();
								if (result.type === 'success') {
									anchor = null;
									anchorMode = false;
								}
							}}
					>
						<input type="hidden" name="version" value={view.id} />
						{#if anchor}
							<input type="hidden" name="pagina" value={anchor.page} />
							<input type="hidden" name="x" value={anchor.x} />
							<input type="hidden" name="y" value={anchor.y} />
						{/if}
						<label class="sr-only" for="comentario">Nuevo comentario</label>
						<input
							id="comentario"
							name="texto"
							required
							maxlength="2000"
							autocomplete="off"
							placeholder={anchor
								? 'Comentario en el punto marcado'
								: anchorMode
									? 'Pulsa en la página para marcar el punto'
									: 'Comentar'}
						/>
						<Button type="submit" icon={Send} label="Enviar comentario" tipPos="left" />
					</form>
					{#if form?.comment?.error}<p class="field-error">{form.comment.error}</p>{/if}
				{/if}
				{#if view.decisions.length}
					<details class="history">
						<summary>Registro de decisiones</summary>
						<ul>
							{#each view.decisions as d (d.id)}
								<li>
									{fmtDateTime(d.at)} · {d.userName ?? '—'} · {{
										approved: 'Aprobada',
										changes: 'Cambios pedidos',
										reopened: 'Reabierta',
										undone: 'Aprobación deshecha'
									}[d.decision]} · rev. {d.revision}{d.fileHash
										? ` · ${d.fileHash.slice(0, 12)}`
										: ''}
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</section>
			<footer class="vis-f">
				<span class="mono">{view.originalName ?? view.fileKey ?? ''}</span>
				{#if view.fileSize}<span class="num">{fmtSize(view.fileSize)}</span>{/if}
				{#if view.uploadedBy}<span>{view.uploadedBy} · {fmtDateTime(view.uploadedAt)}</span>{/if}
			</footer>
			{#if form?.decision?.error}<p class="field-error floating" role="alert">
					{form.decision.error}
				</p>{/if}

			{#if view.canDecide}
				<ConfirmDialog
					bind:this={dialogs['aprobar']}
					id="aprobar"
					title="¿Aprobar {view.code}?"
					description="Queda registrado con tu nombre, la fecha, el dispositivo y la revisión del fichero."
					confirmLabel="Aprobar"
					tone="green"
					action="?/aprobar"
					fields={{ version: view.id }}
					onresult={approved}
					initiallyOpen={confirmar === 'aprobar'}
				/>
				<ConfirmDialog
					bind:this={dialogs['cambios']}
					id="cambios"
					title="¿Pedir cambios en {view.code}?"
					confirmLabel="Pedir cambios"
					tone="amber"
					action="?/cambios"
					fields={{ version: view.id }}
					initiallyOpen={confirmar === 'cambios'}
				>
					<label class="field"
						><span>Qué hay que cambiar</span><textarea
							class="input area"
							name="comentario"
							required
							minlength="3"
							rows="3"></textarea></label
					>
				</ConfirmDialog>
				<ConfirmDialog
					bind:this={dialogs['reabrir']}
					id="reabrir"
					title="¿Reabrir {view.code}?"
					description="Vuelve a quedar pendiente de aprobar."
					confirmLabel="Reabrir"
					tone="amber"
					action="?/reabrir"
					fields={{ version: view.id }}
					initiallyOpen={confirmar === 'reabrir'}
				/>
			{/if}
		{:else}
			<EmptyState
				icon={FileCheck}
				text={support ? 'Elige una versión.' : 'Elige un soporte y una versión.'}
			/>
		{/if}
	</section>
</div>

{#if support && data.canDecide && waiting.length}
	<ConfirmDialog
		bind:this={dialogs['todas']}
		id="todas"
		title="¿Aprobar {waiting.length} versiones de {support.name}?"
		confirmLabel="Aprobar {waiting.length} versiones"
		tone="green"
		action="?/aprobarTodas"
		fields={{ soporte: support.id }}
		initiallyOpen={confirmar === 'todas'}
	>
		<ul>
			{#each waiting as v (v.id)}<li>
					<span class="mono"
						>{v.code}{#if v.revision > 1}
							<span class="rev">rev. {v.revision}</span>{/if}</span
					><span class="num">{v.kitsCount ?? '—'} kits</span>
				</li>{/each}
		</ul>
		{#if changesCount}<p>
				{changesCount === 1 ? 'Una versión queda fuera' : `${changesCount} versiones quedan fuera`}:
				tienen cambios pedidos.
			</p>{/if}
	</ConfirmDialog>
{/if}
{#if support && data.canUpload}
	<UploadDrawer
		bind:this={uploadDrawer}
		supportId={support.id}
		supportName={support.name}
		initiallyOpen={page.url.searchParams.has('subir') || !!form?.upload}
		error={form?.upload?.error}
	/>
{/if}

<style>
	:global(.content:has(.apr)) {
		padding: 0;
		max-width: none;
	}
	.apr {
		display: grid;
		grid-template-columns: 272px 320px minmax(0, 1fr);
		height: calc(100vh - var(--top));
		height: calc(100dvh - var(--top));
	}
	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--line);
		overflow: hidden;
		background: var(--bg);
	}
	.col:last-child {
		border-right: 0;
	}
	.col-h {
		min-height: 52px;
		padding: 8px 16px;
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	.col-h > div {
		min-width: 0;
	}
	.col-h b {
		display: block;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.col-h small {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.spacer {
		flex: 1;
	}
	.back {
		display: none;
		width: 36px;
		height: 36px;
		place-items: center;
		margin-left: -8px;
		flex: none;
	}
	.col-sub {
		padding: 8px 16px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	.col-b {
		overflow: auto;
		flex: 1;
		min-height: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 20px;
		border-bottom: 1px solid var(--line-soft);
		transition: background var(--t);
	}
	.row:hover,
	.vrow:hover {
		background: var(--line-soft);
	}
	.row > div {
		min-width: 0;
		flex: 1;
	}
	.row b {
		display: block;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row small {
		display: block;
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row.sel,
	.vrow.sel {
		background: var(--surface);
		box-shadow: inset 2px 0 0 var(--primary);
	}
	.count {
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		display: inline-grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		border-radius: 2px;
		background: var(--line-soft);
	}
	.count.warn {
		background: var(--amber);
		color: var(--on-amber);
	}
	.empty {
		padding: 16px 20px;
		color: var(--muted);
		font-size: 13px;
	}
	.vrow {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		height: 36px;
		border-bottom: 1px solid var(--line-soft);
		transition: background var(--t);
	}
	.mono,
	.code {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.vrow .code {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rev {
		font-size: 11px;
		color: var(--muted);
		margin-left: 6px;
		font-weight: 400;
	}
	.kits {
		font-size: 12px;
		color: var(--muted);
	}
	.vis-h .code {
		font-size: 16px;
	}
	.acts {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 16px;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	.comments {
		flex: none;
		max-height: 38%;
		overflow: auto;
		border-top: 1px solid var(--line);
		background: var(--surface);
		padding: 12px 16px;
		display: grid;
		gap: 12px;
	}
	.cm {
		display: grid;
		grid-template-columns: 22px 1fr;
		gap: 4px 10px;
		font-size: 13px;
	}
	.cm .pin,
	.cm .n {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		border-radius: 50%;
	}
	.cm .pin {
		background: var(--amber);
		color: var(--on-amber);
	}
	.cm .n {
		background: var(--line-soft);
	}
	.cm header {
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.cm header b {
		font-weight: 500;
	}
	.cm time {
		font-size: 12px;
		color: var(--muted);
	}
	.cm p {
		grid-column: 2;
	}
	.cm-form {
		display: flex;
		gap: 8px;
	}
	.cm-form input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 0;
		background: var(--bg);
		color: inherit;
		font: inherit;
	}
	.history {
		font-size: 12px;
		color: var(--muted);
	}
	.history ul {
		margin: 6px 0 0;
		padding-left: 16px;
	}
	.vis-f {
		flex: none;
		display: flex;
		gap: 16px;
		align-items: center;
		padding: 8px 16px;
		border-top: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
	}
	.vis-f span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.floating {
		position: fixed;
		right: 24px;
		bottom: 24px;
		background: var(--surface);
		padding: 8px 12px;
		border: 1px solid var(--red);
	}
	.area {
		height: auto;
		padding: 8px 12px;
	}
	:global(#todas .dlg-b .rev) {
		color: var(--muted);
	}

	/* Tablet: dos columnas y el visor a pantalla completa al abrir una versión. */
	@media (max-width: 1023px) {
		.apr {
			grid-template-columns: 240px minmax(0, 1fr);
		}
		.col-vis {
			display: none;
		}
		.apr[data-step='visor'] .col-vis {
			display: flex;
			position: fixed;
			inset: 0;
			z-index: 50;
			border: 0;
		}
		.apr[data-step='visor'] .col-vis .back {
			display: inline-grid;
		}
	}
	/* Móvil: pantallas encadenadas; las acciones del visor en una barra inferior (7.5, regla 8). */
	@media (max-width: 767px) {
		.apr {
			display: block;
			height: auto;
		}
		.col {
			display: none;
			border-right: 0;
			height: calc(100dvh - var(--top) - var(--tab));
		}
		.apr[data-step='soportes'] .col-sop,
		.apr[data-step='versiones'] .col-ver {
			display: flex;
		}
		.apr[data-step='visor'] .col-vis {
			display: flex;
			position: static;
			height: calc(100dvh - var(--top) - var(--tab));
		}
		.col-h .back {
			display: inline-grid;
		}
		.vis-h small {
			display: none;
		}
		.vis-h .acts {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			height: calc(var(--tab) + env(safe-area-inset-bottom));
			padding-bottom: env(safe-area-inset-bottom);
			display: flex;
			justify-content: space-evenly;
			align-items: center;
			gap: 0;
			background: var(--surface);
			border-top: 1px solid var(--line);
			z-index: 35;
		}
		:global(body:has(.apr[data-step='visor']) .tabbar) {
			display: none;
		}
		.vrow {
			height: 44px;
		}
		.row {
			padding: 12px 16px;
		}
		.comments {
			max-height: 30%;
		}
		.vis-f {
			display: none;
		}
	}
</style>
