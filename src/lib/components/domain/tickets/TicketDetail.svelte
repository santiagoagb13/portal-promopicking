<!--
	Detalle de un registro de soporte (8.11): datos, hilo con fotos y acciones según permisos.
	Responder (principal), asignar y severidad (neutros), cerrar (verde, confirmación), reabrir (ámbar).
	Todo son formularios: funciona sin JavaScript; con él, la foto se reduce antes de enviarla.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Check from '@lucide/svelte/icons/check';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { fmtDateTime } from '$lib/domain/dates';
	import {
		SEVERITIES,
		SEVERITY_LABEL,
		SEVERITY_TONE,
		TICKET_STATE_LABEL,
		TICKET_STATE_TONE,
		TICKET_TYPE_LABEL,
		TICKET_TYPE_TONE,
		type Severity,
		type TicketState,
		type TicketType
	} from '$lib/domain/tickets';
	import { shrinkPhoto } from '$lib/photo';

	type Update = {
		id: number;
		at: Date;
		kind: string;
		text: string;
		author: string;
		organization: string | null;
		photoUrl: string | null;
	};
	type Props = {
		t: {
			id: string;
			type: TicketType;
			kind: string;
			title: string;
			severity: Severity;
			state: TicketState;
			openedAt: Date;
			openedByName: string;
			assignedTo: string | null;
			assigneeName: string | null;
			campaignId: string | null;
			campaignName: string | null;
			restaurantId: string | null;
			restaurantName: string | null;
			orderId: string | null;
			kitId: string | null;
			updates: Update[];
			can: { reply: boolean; manage: boolean; close: boolean; reopen: boolean };
		};
		assignees: { id: string; name: string; organization: string | null }[];
		error?: string | null;
		confirmClose?: boolean;
		/** Enlace sin JS que abre la confirmación de cierre conservando los filtros. */
		closeHref: string;
	};
	let { t, assignees, error = null, confirmClose = false, closeHref }: Props = $props();

	let closeDialog: ConfirmDialog | undefined = $state();
	let busy = $state(false);

	const withSmallPhoto: SubmitFunction = async ({ formData }) => {
		busy = true;
		const f = formData.get('foto');
		if (f instanceof File && f.size) formData.set('foto', await shrinkPhoto(f), 'foto.jpg');
		return async ({ update }) => {
			busy = false;
			await update();
		};
	};
	const plain: SubmitFunction =
		() =>
		async ({ update }) =>
			update({ reset: false });
</script>

<div class="head">
	<p class="chips">
		<Chip tone={TICKET_TYPE_TONE[t.type]}>{TICKET_TYPE_LABEL[t.type]}</Chip>
		<Chip tone="outline">{t.kind}</Chip>
		<Chip tone={TICKET_STATE_TONE[t.state]}>{TICKET_STATE_LABEL[t.state]}</Chip>
		<Chip tone={SEVERITY_TONE[t.severity]}
			>Severidad {SEVERITY_LABEL[t.severity].toLowerCase()}</Chip
		>
	</p>
	<p class="title">{t.title}</p>
	<dl>
		{#if t.campaignId}<dt>Campaña</dt>
			<dd>
				<a href="/campanas/{t.campaignId}">{t.campaignName}</a>
				<span class="mono">{t.campaignId}</span>
			</dd>{/if}
		{#if t.restaurantId}<dt>Restaurante</dt>
			<dd>{t.restaurantName} <span class="mono">{t.restaurantId}</span></dd>{/if}
		{#if t.kitId}<dt>Kit</dt>
			<dd><a class="mono" href="/kits/{t.kitId}">{t.kitId}</a></dd>{/if}
		{#if t.orderId}<dt>Pedido</dt>
			<dd><a class="mono" href="/reposiciones/pedidos/{t.orderId}">{t.orderId}</a></dd>{/if}
		<dt>Abierto por</dt>
		<dd>{t.openedByName} · {fmtDateTime(t.openedAt)}</dd>
		<dt>Responsable</dt>
		<dd>{t.assigneeName ?? 'Sin asignar'}</dd>
	</dl>
</div>

{#if error}<p class="field-error" role="alert">{error}</p>{/if}

<ol class="thread" aria-label="Hilo">
	{#each t.updates as u (u.id)}
		{#if u.kind === 'reply'}
			<li class="reply">
				<p class="who">
					<b>{u.author}</b>{#if u.organization}<span> · {u.organization}</span>{/if}<time
						>{fmtDateTime(u.at)}</time
					>
				</p>
				<p class="txt">{u.text}</p>
				{#if u.photoUrl}
					<a href={u.photoUrl} target="_blank" rel="noopener" class="photo"
						><img src={u.photoUrl} alt="Foto adjunta por {u.author}" loading="lazy" /></a
					>
				{/if}
			</li>
		{:else}
			<li class="event"><time>{fmtDateTime(u.at)}</time> {u.text} · {u.author}</li>
		{/if}
	{/each}
</ol>

{#if t.can.reply}
	<form
		method="POST"
		action="?/responder"
		enctype="multipart/form-data"
		class="reply-form"
		use:enhance={withSmallPhoto}
	>
		<input type="hidden" name="ticket" value={t.id} />
		<label class="field">
			<span>Respuesta</span>
			<textarea
				class="input area"
				name="texto"
				rows="3"
				maxlength="4000"
				required
				placeholder="Escribe una respuesta…"></textarea>
		</label>
		<label class="field">
			<span>Foto (opcional)</span>
			<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" />
		</label>
		<div><Button type="submit" variant="primary" disabled={busy}>Responder</Button></div>
	</form>
{/if}

{#if t.can.manage}
	<div class="manage">
		<form method="POST" action="?/asignar" use:enhance={plain}>
			<input type="hidden" name="ticket" value={t.id} />
			<label class="field">
				<span>Responsable</span>
				<select class="input" name="responsable">
					<option value="" selected={!t.assignedTo}>Sin asignar</option>
					{#each assignees as p (p.id)}
						<option value={p.id} selected={p.id === t.assignedTo}
							>{p.name}{p.organization ? ` · ${p.organization}` : ''}</option
						>
					{/each}
				</select>
			</label>
			<Button type="submit">Asignar</Button>
		</form>
		<form method="POST" action="?/severidad" use:enhance={plain}>
			<input type="hidden" name="ticket" value={t.id} />
			<label class="field">
				<span>Severidad</span>
				<select class="input" name="severidad">
					{#each SEVERITIES as s (s)}<option value={s} selected={s === t.severity}
							>{SEVERITY_LABEL[s]}</option
						>{/each}
				</select>
			</label>
			<Button type="submit">Cambiar</Button>
		</form>
	</div>
{/if}

{#if t.can.close || t.can.reopen}
	<div class="end">
		{#if t.can.close}
			<Button
				href={closeHref}
				variant="green"
				icon={Check}
				onclick={(e: MouseEvent) => {
					e.preventDefault();
					closeDialog?.show();
				}}>Cerrar registro</Button
			>
			<ConfirmDialog
				bind:this={closeDialog}
				id="cerrar-{t.id}"
				title="¿Cerrar {t.id}?"
				description="Se avisa a quien lo abrió. Se puede reabrir si vuelve a pasar."
				confirmLabel="Cerrar registro"
				tone="green"
				action="?/cerrar"
				fields={{ ticket: t.id }}
				initiallyOpen={confirmClose}
			/>
		{/if}
		{#if t.can.reopen}
			<form method="POST" action="?/reabrir" use:enhance={plain}>
				<input type="hidden" name="ticket" value={t.id} />
				<Button type="submit" variant="amber" icon={RotateCcw}>Reabrir</Button>
			</form>
		{/if}
	</div>
{/if}

<style>
	.head {
		display: grid;
		gap: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
	}
	.title {
		font-size: 16px;
		font-weight: 500;
		margin: 0;
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 4px 12px;
		margin: 4px 0 0;
		font-size: 13px;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--muted);
	}
	a.mono {
		color: inherit;
	}
	.thread {
		list-style: none;
		margin: 20px 0;
		padding: 0;
		display: grid;
		gap: 12px;
		border-top: 1px solid var(--line);
		padding-top: 16px;
	}
	.reply {
		display: grid;
		gap: 4px;
	}
	.who {
		margin: 0;
		font-size: 13px;
		display: flex;
		flex-wrap: wrap;
		gap: 0 4px;
	}
	.who b {
		font-weight: 500;
	}
	.who span,
	time {
		color: var(--muted);
	}
	.who time {
		margin-left: auto;
		font-size: 12px;
	}
	.txt {
		margin: 0;
		white-space: pre-line;
		font-size: 14px;
	}
	.photo img {
		display: block;
		max-width: 100%;
		max-height: 240px;
		border: 1px solid var(--line);
	}
	.event {
		font-size: 12px;
		color: var(--muted);
	}
	.event time {
		margin-right: 4px;
	}
	.reply-form,
	.manage {
		display: grid;
		gap: 12px;
		border-top: 1px solid var(--line);
		padding-top: 16px;
		margin-top: 16px;
	}
	.manage form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 8px;
	}
	.area {
		height: auto;
		padding: 8px 12px;
		resize: vertical;
	}
	.end {
		display: flex;
		gap: 8px;
		margin-top: 20px;
	}
</style>
