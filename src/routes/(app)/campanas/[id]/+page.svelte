<!-- Detalle de campaña (8.4). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Copy from '@lucide/svelte/icons/copy';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Eye from '@lucide/svelte/icons/eye';
	import Layers from '@lucide/svelte/icons/layers';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import Drawer from '$components/ui/Drawer.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import { closeOnSuccess } from '$components/ui/forms';
	import BrandChip from '$components/domain/BrandChip.svelte';
	import CampaignForm from '$components/domain/CampaignForm.svelte';
	import ProgressBar from '$components/domain/ProgressBar.svelte';
	import Semaphore from '$components/domain/Semaphore.svelte';
	import {
		MILESTONE_KEYS,
		MILESTONE_LABEL,
		SEMAPHORE_REASON,
		STAGE_MILESTONE,
		STAGES,
		stageLabel,
		stageTone
	} from '$lib/domain/campaign';
	import { fmtDateTime, fmtDay, relDays } from '$lib/domain/dates';

	let { data, form: rawForm } = $props();
	type Failure = { error?: string; values?: Record<string, string | number | null | undefined> };
	/** Resultado de las acciones: cada formulario devuelve sus errores bajo su clave. */
	const form = $derived(
		rawForm as {
			edit?: Failure;
			milestones?: Failure;
			duplicate?: Failure;
			archive?: Failure;
			support?: Failure & { id?: string | null };
		} | null
	);
	const c = $derived(data.campaign);
	type Support = (typeof data.supports)[number];

	let editDrawer: Drawer | undefined = $state();
	let milestonesDrawer: Drawer | undefined = $state();
	let supportDrawer: Drawer | undefined = $state();
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	/** Soporte en edición; `null` = alta. */
	let editing = $state<Support | null>(null);

	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	const due = $derived(Object.fromEntries(data.milestones.map((m) => [m.key, m])));
	const KIT_STATES = ['Preparado', 'Expedido', 'En plataforma', 'En reparto', 'Recibido'];
	const TICKET_STATE: Record<string, [string, '' | 'green' | 'amber' | 'red' | 'info']> = {
		open: ['Abierta', 'red'],
		in_progress: ['En curso', 'amber'],
		answered: ['Respondida', 'info'],
		closed: ['Cerrada', 'green']
	};

	$effect.pre(() => {
		const open = data.open ?? '';
		if (open.startsWith('soporte-'))
			editing = data.supports.find((s) => s.id === open.slice(8)) ?? null;
	});

	function openSupport(e: MouseEvent, s: Support | null) {
		e.preventDefault();
		editing = s;
		supportDrawer?.show();
	}
	function openDialog(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}
	function openDrawer(e: MouseEvent, d: Drawer | undefined) {
		e.preventDefault();
		d?.show();
	}

	const supportColumns = $derived([
		{ key: 'name', label: 'Soporte', card: 'title' as const },
		{ key: 'versions', label: 'Versiones', align: 'right' as const },
		{ key: 'qty', label: 'Tirada', align: 'right' as const },
		{ key: 'stage', label: 'Estado' },
		{ key: 'due', label: 'Fecha comprometida' },
		{ key: 'acts', label: 'Acciones', align: 'right' as const, card: 'aside' as const }
	]);
	const supportValues = $derived(
		form?.support?.values ??
			(editing
				? { ...editing, perKitQty: editing.perKitQty ?? '' }
				: { versionsPlanned: 1, runQty: 0, stage: 0 })
	);
</script>

<div class="head">
	<div class="title">
		<Button href="/campanas" variant="ghost" icon={ChevronLeft} label="Volver a campañas" />
		<span class="id">{c.id}</span>
		<BrandChip short={c.brandShort} />
		<Chip tone={c.stageTone}>{c.stageLabel}</Chip>
		<span class="sem"><Semaphore value={c.semaphore} />{SEMAPHORE_REASON[c.semaphore]}</span>
		{#if c.archived}<Chip tone="outline">Archivada</Chip>{/if}
	</div>
	{#if data.canEdit}
		<div class="acts">
			{#if !c.archived}
				<Button
					href="?abrir=editar"
					variant="ghost"
					icon={Pencil}
					label="Editar"
					onclick={(e: MouseEvent) => openDrawer(e, editDrawer)}
				/>
				<Button
					href="?abrir=hitos"
					variant="ghost"
					icon={CalendarClock}
					label="Editar calendario"
					onclick={(e: MouseEvent) => openDrawer(e, milestonesDrawer)}
				/>
			{/if}
			{#if data.canCreate}
				<Button
					href="?confirmar=duplicar"
					variant="ghost"
					icon={Copy}
					label="Duplicar como plantilla"
					onclick={(e: MouseEvent) => openDialog(e, 'duplicar')}
				/>
			{/if}
			{#if c.archived}
				<Button
					href="?confirmar=restaurar"
					variant="amber"
					icon={ArchiveRestore}
					label="Restaurar"
					tipPos="left"
					onclick={(e: MouseEvent) => openDialog(e, 'restaurar')}
				/>
			{:else}
				<Button
					href="?confirmar=archivar"
					variant="red"
					icon={Archive}
					label="Archivar"
					tipPos="left"
					onclick={(e: MouseEvent) => openDialog(e, 'archivar')}
				/>
			{/if}
		</div>
	{/if}
</div>
<p class="meta">
	En restaurante el <b class="num">{fmtDay(c.inRestaurantOn)}</b> · {relDays(
		c.inRestaurantOn,
		data.today
	)} ·
	{c.restaurantCount} restaurantes · <ProgressBar value={c.progress} />
</p>
{#if data.created}<p class="note">Campaña creada. Añade sus soportes.</p>{/if}

<!-- Fases con su fecha comprometida (stepper horizontal; vertical en móvil). -->
<ol class="stepper" aria-label="Fases">
	{#each STAGES as s, i (s)}
		{@const m = due[STAGE_MILESTONE[i]!]}
		{@const state = c.planned
			? 'todo'
			: i < c.stage || c.stage === 6
				? 'done'
				: i === c.stage
					? 'current'
					: 'todo'}
		<li
			class={state}
			class:late={m?.overdue}
			aria-current={state === 'current' ? 'step' : undefined}
		>
			<span class="n"
				>{#if state === 'done'}<Check size={14} strokeWidth={2} aria-label="Hecha" />{:else}{i +
						1}{/if}</span
			>
			<span class="l">{s}</span>
			{#if m}<span class="d num">{fmtDay(m.dueOn)}</span>{/if}
		</li>
	{/each}
</ol>

<div class="grid">
	<section class="main">
		<div class="sec-h">
			<h2>Soportes</h2>
			{#if data.canEdit && !c.archived}
				<Button
					href="?abrir=soporte-nuevo"
					variant="primary"
					icon={Plus}
					label="Añadir soporte"
					tipPos="left"
					onclick={(e: MouseEvent) => openSupport(e, null)}
				/>
			{/if}
		</div>
		{#if form?.support?.error && !form?.support?.values}<p class="field-error" role="alert">
				{form.support.error}
			</p>{/if}
		{#if data.supports.length}
			<DataTable
				caption="Soportes de la campaña"
				columns={supportColumns}
				rows={data.supports}
				key={(s: Support) => s.id}
				mobilePage={50}
			>
				{#snippet cell(s: Support, col)}
					{#if col.key === 'name'}
						<b class="sname">{s.name}</b><small
							>{[s.packaging, s.responsible].filter(Boolean).join(' · ')}</small
						>
					{:else if col.key === 'versions'}
						<span class="num">{s.versionsPlanned}</span>
					{:else if col.key === 'qty'}
						<span class="num">{s.runQty.toLocaleString('es-ES')}</span>
					{:else if col.key === 'stage'}
						<span class="st">
							<Chip tone={stageTone(s.stage)}>{stageLabel(s.stage)}</Chip>
							{#if s.versions}<small
									>{s.pending
										? `${s.pending} pendientes de ${s.versions}`
										: 'Todas aprobadas'}</small
								>{/if}
						</span>
					{:else if col.key === 'due'}
						{#if s.dueOn}
							{@const late = s.stage < 6 && s.dueOn < data.today}
							<span class="num" class:late>{fmtDay(s.dueOn)}</span><small class:late
								>{s.stage === 6 ? 'entregado' : relDays(s.dueOn, data.today)}</small
							>
						{:else}—{/if}
					{:else if col.key === 'resp'}
						<small class="resp">{s.responsible ?? '—'}</small>
					{:else if col.key === 'acts'}
						<span class="row-acts">
							{#if s.versions && data.canSeeApprovals}
								<Button
									href="/aprobaciones?soporte={s.id}"
									variant="ghost"
									icon={Eye}
									label="Ver aprobación"
								/>
							{/if}
							{#if data.canEdit && !c.archived}
								<Button
									href="?abrir=soporte-{s.id}"
									variant="ghost"
									icon={Pencil}
									label="Editar soporte"
									onclick={(e: MouseEvent) => openSupport(e, s)}
								/>
								{#if !s.versions}
									<Button
										href="?confirmar=borrar-{s.id}"
										variant="red"
										icon={Trash2}
										label="Eliminar soporte"
										tipPos="left"
										onclick={(e: MouseEvent) => openDialog(e, `borrar-${s.id}`)}
									/>
									<ConfirmDialog
										bind:this={dialogs[`borrar-${s.id}`]}
										id="borrar-{s.id}"
										title="¿Eliminar el soporte «{s.name}»?"
										confirmLabel="Eliminar"
										tone="red"
										action="?/borrarSoporte"
										fields={{ id: s.id }}
										initiallyOpen={confirmar === `borrar-${s.id}`}
									/>
								{/if}
							{/if}
						</span>
					{/if}
				{/snippet}
			</DataTable>
		{:else}
			<EmptyState icon={Layers} text="La campaña aún no tiene soportes." />
		{/if}
	</section>

	<aside class="side">
		<section>
			<h2>Calendario comprometido</h2>
			<ul class="list">
				{#each data.milestones as m (m.key)}
					<li class:done={!!m.doneAt} class:late={m.overdue}>
						<span class="num date"
							>{#if m.doneAt}<Check size={14} strokeWidth={1.5} aria-label="Hecho" />{/if}{fmtDay(
								m.dueOn
							)}</span
						>
						<span class="grow">{MILESTONE_LABEL[m.key]}</span>
						<small>{m.doneAt ? 'hecho' : relDays(m.dueOn, data.today)}</small>
					</li>
				{/each}
			</ul>
		</section>
		{#if data.kits.length}
			<section>
				<h2>Kits</h2>
				<div class="kits">
					{#each data.kits as k (k.state)}
						<Chip tone={k.state === 4 ? 'green' : k.state === 3 ? 'amber' : ''}
							>{KIT_STATES[k.state]} · {k.n}</Chip
						>
					{/each}
				</div>
			</section>
		{/if}
		<section>
			<h2>Soporte e incidencias</h2>
			{#if data.tickets.length}
				<ul class="list">
					{#each data.tickets as t (t.id)}
						{@const st = TICKET_STATE[t.state]!}
						<li class="ticket">
							<div class="grow">
								<span class="id">{t.id}</span>
								<Chip tone={st[1]}>{st[0]}</Chip>
								<p>{t.title}</p>
								<small
									>{t.type === 'incident' ? 'Incidencia' : 'Consulta'} · {t.kind} · {fmtDateTime(
										t.openedAt
									)}</small
								>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">Sin consultas ni incidencias.</p>
			{/if}
		</section>
		<section>
			<h2>Datos</h2>
			<dl>
				{#if c.materials}<dt>Materiales</dt>
					<dd>{c.materials}</dd>{/if}
				<dt>Responsable</dt>
				<dd>{c.ownerName ?? 'Sin asignar'}</dd>
				{#if c.templateOf}<dt>Plantilla</dt>
					<dd><a href="/campanas/{c.templateOf}">{c.templateOf}</a></dd>{/if}
				{#if c.notes}<dt>Notas</dt>
					<dd>{c.notes}</dd>{/if}
			</dl>
		</section>
	</aside>
</div>

{#if data.canEdit}
	<Drawer
		bind:this={editDrawer}
		id="editar"
		title="Editar campaña"
		initiallyOpen={data.open === 'editar' || !!form?.edit}
		closeHref="?"
	>
		<CampaignForm
			edit
			action="?/editar"
			brands={[{ code: c.brandCode, label: c.brandShort, restaurantCount: c.restaurantCount }]}
			owners={data.owners}
			values={form?.edit?.values ?? {
				brandCode: c.brandCode,
				name: c.name,
				inRestaurantOn: c.inRestaurantOn,
				restaurantCount: c.restaurantCount,
				planned: c.planned,
				materials: c.materials,
				notes: c.notes,
				ownerUserId: c.ownerUserId
			}}
			error={form?.edit?.error}
			onclose={() => editDrawer?.close()}
		/>
	</Drawer>

	<Drawer
		bind:this={milestonesDrawer}
		id="hitos"
		title="Calendario comprometido"
		initiallyOpen={data.open === 'hitos' || !!form?.milestones}
		closeHref="?"
	>
		<form
			method="POST"
			action="?/hitos"
			class="form"
			use:enhance={closeOnSuccess(() => milestonesDrawer?.close())}
		>
			{#each MILESTONE_KEYS as k (k)}
				<label class="field">
					<span>{MILESTONE_LABEL[k]}</span>
					<input
						class="input"
						type="date"
						name={k}
						required
						value={due[k]?.dueOn ?? ''}
						readonly={k === 'rte'}
					/>
				</label>
			{/each}
			{#if form?.milestones?.error}<p class="field-error" role="alert">
					{form.milestones.error}
				</p>{/if}
			<div class="actions">
				<Button type="button" onclick={() => milestonesDrawer?.close()}>Cancelar</Button>
				<Button type="submit" variant="primary">Guardar</Button>
			</div>
		</form>
	</Drawer>

	<Drawer
		bind:this={supportDrawer}
		id="soporte"
		title={editing ? 'Editar soporte' : 'Nuevo soporte'}
		initiallyOpen={(data.open ?? '').startsWith('soporte-') || !!form?.support?.values}
		closeHref="?"
	>
		{#key editing?.id}
			<form
				method="POST"
				action="?/soporte"
				class="form"
				use:enhance={closeOnSuccess(() => supportDrawer?.close())}
			>
				{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
				<label class="field"
					><span>Nombre</span><input
						class="input"
						name="name"
						required
						minlength="2"
						maxlength="160"
						value={supportValues.name ?? ''}
					/></label
				>
				<div class="row2">
					<label class="field"
						><span>Versiones</span><input
							class="input"
							type="number"
							name="versionsPlanned"
							min="0"
							required
							value={supportValues.versionsPlanned ?? 0}
						/></label
					>
					<label class="field"
						><span>Tirada (uds)</span><input
							class="input"
							type="number"
							name="runQty"
							min="0"
							required
							value={supportValues.runQty ?? 0}
						/></label
					>
				</div>
				<div class="row2">
					<label class="field"
						><span>Uds por kit</span><input
							class="input"
							type="number"
							name="perKitQty"
							min="1"
							value={supportValues.perKitQty ?? ''}
						/></label
					>
					<label class="field">
						<span>Fase</span>
						<select class="input" name="stage" value={String(supportValues.stage ?? 0)}>
							{#each STAGES as s, i (s)}<option value={String(i)}>{s}</option>{/each}
						</select>
					</label>
				</div>
				<label class="field"
					><span>Empaquetado</span><input
						class="input"
						name="packaging"
						maxlength="160"
						value={supportValues.packaging ?? ''}
					/></label
				>
				<label class="field"
					><span>Responsable</span><input
						class="input"
						name="responsible"
						maxlength="160"
						value={supportValues.responsible ?? ''}
					/></label
				>
				<label class="field"
					><span>Notas</span><input
						class="input"
						name="notes"
						maxlength="400"
						value={supportValues.notes ?? ''}
					/></label
				>
				{#if form?.support?.error && form?.support?.values}<p class="field-error" role="alert">
						{form.support.error}
					</p>{/if}
				<div class="actions">
					<Button type="button" onclick={() => supportDrawer?.close()}>Cancelar</Button>
					<Button type="submit" variant="primary">{editing ? 'Guardar' : 'Añadir soporte'}</Button>
				</div>
			</form>
		{/key}
	</Drawer>

	{#if data.canCreate}
		<ConfirmDialog
			bind:this={dialogs['duplicar']}
			id="duplicar"
			title="¿Duplicar «{c.name}» como plantilla?"
			description="Se copian los datos y los soportes (en fase de brief) con una fecha nueva."
			confirmLabel="Duplicar"
			action="?/duplicar"
			initiallyOpen={confirmar === 'duplicar' || !!form?.duplicate}
		>
			<label class="field"
				><span>Nombre</span><input
					class="input"
					name="name"
					required
					minlength="2"
					value="{c.name} (copia)"
				/></label
			>
			<label class="field"
				><span>En restaurante</span><input
					class="input"
					type="date"
					name="inRestaurantOn"
					required
				/></label
			>
			{#if form?.duplicate?.error}<p class="field-error">{form.duplicate.error}</p>{/if}
		</ConfirmDialog>
	{/if}
	<ConfirmDialog
		bind:this={dialogs['archivar']}
		id="archivar"
		title="¿Archivar la campaña?"
		description="Deja de verse en el panel. Se puede restaurar."
		confirmLabel="Archivar"
		tone="red"
		action="?/archivar"
		typeToConfirm={c.name}
		initiallyOpen={confirmar === 'archivar' || !!form?.archive}
	/>
	<ConfirmDialog
		bind:this={dialogs['restaurar']}
		id="restaurar"
		title="¿Restaurar «{c.name}»?"
		description="Vuelve a aparecer en el panel."
		confirmLabel="Restaurar"
		tone="amber"
		action="?/restaurar"
		initiallyOpen={confirmar === 'restaurar'}
	/>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
	}
	.title,
	.acts {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
	}
	.acts {
		gap: 4px;
	}
	.title :global(.b:first-child) {
		margin-left: -8px;
	}
	.id {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
	}
	.sem {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		color: var(--muted);
		font-size: 13px;
		padding: 8px 0 16px;
		border-bottom: 1px solid var(--line);
	}
	.meta b {
		color: var(--ink);
		font-weight: 500;
	}
	.note {
		margin-top: 12px;
		padding: 10px 12px;
		border-left: 2px solid var(--green);
		background: color-mix(in srgb, var(--green) 8%, transparent);
		font-size: 13px;
	}
	.stepper {
		list-style: none;
		margin: 0;
		padding: 20px 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 8px;
		border-bottom: 1px solid var(--line);
	}
	.stepper li {
		display: grid;
		gap: 4px;
		align-content: start;
		font-size: 12px;
		color: var(--muted);
		padding-top: 8px;
		border-top: 2px solid var(--line);
		min-width: 0;
	}
	.stepper .n {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
	}
	.stepper .done {
		border-top-color: var(--ink);
		color: var(--ink);
	}
	.stepper .done .n {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}
	.stepper .current {
		border-top-color: var(--ink);
		color: var(--ink);
		font-weight: 500;
	}
	.stepper .current .n {
		border-color: var(--ink);
	}
	.stepper .late .d {
		color: var(--red);
		font-weight: 500;
	}
	.stepper .l {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 32px;
		padding-top: 24px;
	}
	/* Lateral solo cuando la tabla de soportes cabe a su lado. */
	@media (min-width: 1440px) {
		.grid {
			grid-template-columns: minmax(0, 1fr) 300px;
			gap: 40px;
		}
	}
	@media (min-width: 1024px) and (max-width: 1439px) {
		.side {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.main,
	.side,
	.side section {
		display: grid;
		gap: 12px;
		align-content: start;
		min-width: 0;
	}
	.side {
		gap: 32px;
	}
	.sec-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sname {
		font-weight: 500;
		display: block;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.st {
		display: grid;
		gap: 2px;
		justify-items: start;
	}
	.late {
		color: var(--red);
	}
	.resp {
		max-width: 180px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-acts {
		display: inline-flex;
		gap: 2px;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--line);
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 36px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
	}
	.list li.done {
		color: var(--muted);
	}
	.list li.late .date {
		color: var(--red);
		font-weight: 500;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.date {
		width: 88px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
	}
	.ticket p {
		margin: 4px 0 2px;
	}
	.kits {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
	}
	dl {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		gap: 6px 12px;
		font-size: 13px;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	dd a {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	@media (max-width: 767px) {
		.stepper {
			grid-template-columns: 1fr;
			gap: 0;
		}
		.stepper li {
			grid-template-columns: 22px minmax(0, 1fr) auto;
			align-items: center;
			gap: 12px;
			border-top: 0;
			border-left: 2px solid var(--line);
			padding: 6px 0 6px 12px;
			font-size: 13px;
		}
		.stepper .done,
		.stepper .current {
			border-left-color: var(--ink);
		}
	}
</style>
