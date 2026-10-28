<!-- Soporte e incidencias (8.11): lista con filtros en la URL, detalle y alta en panel lateral. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import LifeBuoy from '@lucide/svelte/icons/life-buoy';
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import Drawer from '$components/ui/Drawer.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import Segmented from '$components/ui/Segmented.svelte';
	import TicketDetail from '$components/domain/tickets/TicketDetail.svelte';
	import { fmtDateTime } from '$lib/domain/dates';
	import {
		RESPONSE_COMMITMENTS,
		SEVERITIES,
		SEVERITY_LABEL,
		SEVERITY_TONE,
		TICKET_STATE_LABEL,
		TICKET_STATE_TONE,
		TICKET_TYPE_LABEL,
		TICKET_TYPE_TONE,
		TICKET_TYPES
	} from '$lib/domain/tickets';
	import { shrinkPhoto } from '$lib/photo';

	let { data, form } = $props();
	let detail: Drawer | undefined = $state();
	let creator: Drawer | undefined = $state();
	let sending = $state(false);

	function withParams(changes: Record<string, string | null>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const p = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) p.delete(k);
			else p.set(k, v);
		}
		p.delete('confirmar');
		const s = p.toString();
		return s ? `?${s}` : '?';
	}

	$effect(() => {
		// El detalle se abre al llegar con ?abrir= (registro pulsado, aviso o enlace del correo).
		if (data.ticket) detail?.show();
	});

	const createWithPhoto: SubmitFunction = async ({ formData }) => {
		sending = true;
		const f = formData.get('foto');
		if (f instanceof File && f.size) formData.set('foto', await shrinkPhoto(f), 'foto.jpg');
		return async ({ result, update }) => {
			sending = false;
			await update();
			if (result.type === 'success' && typeof result.data?.created === 'string') {
				creator?.close();
				await goto(withParams({ nuevo: null, abrir: result.data.created }), { noScroll: true });
			}
		};
	};
	const ticketError = $derived(
		form && 'ticket' in form && form.ticket === data.ticket?.id ? (form.error ?? null) : null
	);
</script>

<div class="bar">
	<Segmented
		label="Estado"
		items={[
			{
				href: withParams({ todas: null, abrir: null }),
				label: 'Abiertas',
				active: data.filters.open
			},
			{ href: withParams({ todas: '1', abrir: null }), label: 'Todas', active: !data.filters.open }
		]}
	/>
	<form method="GET" class="filters" aria-label="Filtros">
		{#if !data.filters.open}<input type="hidden" name="todas" value="1" />{/if}
		<label>
			<span class="sr-only">Tipo</span>
			<select class="input" name="tipo" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
				<option value="">Tipo: todos</option>
				{#each TICKET_TYPES as t (t)}<option value={t} selected={data.filters.type === t}
						>{TICKET_TYPE_LABEL[t]}</option
					>{/each}
			</select>
		</label>
		<label>
			<span class="sr-only">Campaña</span>
			<select class="input" name="campana" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
				<option value="">Campaña: todas</option>
				{#each data.options.campaigns as c (c.id)}<option
						value={c.id}
						selected={data.filters.campaignId === c.id}>{c.name} · {c.id}</option
					>{/each}
			</select>
		</label>
		{#if data.options.restaurants.length > 1}
			<label>
				<span class="sr-only">Restaurante</span>
				<select
					class="input"
					name="restaurante"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					<option value="">Restaurante: todos</option>
					{#each data.options.restaurants as r (r.id)}<option
							value={r.id}
							selected={data.filters.restaurantId === r.id}>{r.name}</option
						>{/each}
				</select>
			</label>
		{/if}
		<label>
			<span class="sr-only">Severidad</span>
			<select
				class="input"
				name="severidad"
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			>
				<option value="">Severidad: todas</option>
				{#each SEVERITIES as s (s)}<option value={s} selected={data.filters.severity === s}
						>{SEVERITY_LABEL[s]}</option
					>{/each}
			</select>
		</label>
		<noscript><Button type="submit">Filtrar</Button></noscript>
	</form>
	<div class="spacer"></div>
	<Button
		href={withParams({ nuevo: '1', abrir: null })}
		variant="primary"
		icon={Plus}
		onclick={(e: MouseEvent) => {
			e.preventDefault();
			creator?.show();
		}}>Nuevo registro</Button
	>
</div>

<div class="cols">
	<section aria-labelledby="registros-t">
		<h2 id="registros-t" class="sr-only">Registros</h2>
		{#if form && 'created' in form && form.created}
			<p class="ok" role="status">{form.toast}</p>
		{/if}
		{#if data.tickets.length}
			<ul class="list">
				{#each data.tickets as t (t.id)}
					<li class:current={data.ticket?.id === t.id}>
						<a href={withParams({ abrir: t.id, nuevo: null })} data-sveltekit-noscroll>
							<span class="top">
								<b class="mono">{t.id}</b>
								<Chip tone={TICKET_TYPE_TONE[t.type]}>{TICKET_TYPE_LABEL[t.type]}</Chip>
								<Chip tone="outline">{t.kind}</Chip>
								<Chip tone={TICKET_STATE_TONE[t.state]}>{TICKET_STATE_LABEL[t.state]}</Chip>
								{#if t.severity !== 'low'}<Chip tone={SEVERITY_TONE[t.severity]}
										>{SEVERITY_LABEL[t.severity]}</Chip
									>{/if}
							</span>
							<span class="title">{t.title}</span>
							<small>
								{[t.campaignName, t.restaurantName].filter(Boolean).join(' · ')}
								· {t.openedByName} · {fmtDateTime(t.openedAt)}
								{#if t.replies > 1}· {t.replies - 1} respuestas{/if}
								{#if t.assigneeName}· responsable {t.assigneeName}{/if}
							</small>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<EmptyState
				icon={LifeBuoy}
				text={data.filters.open
					? 'No hay registros abiertos con estos filtros.'
					: 'No hay registros con estos filtros.'}
			/>
		{/if}
	</section>
	<aside aria-labelledby="compromisos-t">
		<h2 id="compromisos-t">Compromisos de respuesta</h2>
		<ul>
			{#each RESPONSE_COMMITMENTS as [k, v] (k)}<li><b>{k}</b> {v}</li>{/each}
			<li>Todo queda en el histórico de la campaña y en el informe mensual.</li>
		</ul>
	</aside>
</div>

{#if data.ticket}
	<Drawer
		bind:this={detail}
		id="registro"
		title={data.ticket.id}
		wide
		initiallyOpen
		closeHref={withParams({ abrir: null })}
	>
		<TicketDetail
			t={data.ticket}
			assignees={data.options.assignees}
			error={ticketError}
			confirmClose={page.url.searchParams.get('confirmar') === 'cerrar'}
			closeHref="{withParams({})}&confirmar=cerrar"
		/>
	</Drawer>
{/if}

<Drawer
	bind:this={creator}
	id="nuevo"
	title="Nueva consulta o incidencia"
	initiallyOpen={data.openNew || !!(form && 'nuevo' in form)}
	closeHref={withParams({ nuevo: null })}
>
	<form
		method="POST"
		action="?/nuevo"
		enctype="multipart/form-data"
		class="new"
		use:enhance={createWithPhoto}
	>
		{#if form && 'nuevo' in form && form.error}<p class="field-error" role="alert">
				{form.error}
			</p>{/if}
		<label class="field">
			<span>Tipo y motivo</span>
			<select class="input" name="motivo" required>
				<option value="">Elige…</option>
				<optgroup label="Consulta">
					{#each data.kinds.query as k (k)}<option value={k} selected={data.prefill.kind === k}
							>{k}</option
						>{/each}
				</optgroup>
				<optgroup label="Incidencia">
					{#each data.kinds.incident as k (k)}<option value={k} selected={data.prefill.kind === k}
							>{k}</option
						>{/each}
				</optgroup>
			</select>
		</label>
		<label class="field">
			<span>Campaña</span>
			<select class="input" name="campana">
				<option value="">Ninguna en concreto</option>
				{#each data.options.campaigns as c (c.id)}<option
						value={c.id}
						selected={data.prefill.campaignId === c.id}>{c.name} · {c.id}</option
					>{/each}
			</select>
		</label>
		<label class="field">
			<span>Restaurante (opcional)</span>
			<select class="input" name="restaurante">
				<option value="">Ninguno</option>
				{#each data.options.restaurants as r (r.id)}<option
						value={r.id}
						selected={data.prefill.restaurantId === r.id}>{r.name} · {r.id}</option
					>{/each}
			</select>
		</label>
		{#if data.prefill.orderId}
			<input type="hidden" name="pedido" value={data.prefill.orderId} />
			<p class="muted">Vinculado al pedido <span class="mono">{data.prefill.orderId}</span>.</p>
		{/if}
		<label class="field">
			<span>Texto</span>
			<textarea
				class="input area"
				name="texto"
				rows="5"
				required
				minlength="3"
				maxlength="4000"
				placeholder="Describe la consulta o la incidencia…"></textarea>
		</label>
		<label class="field">
			<span>Foto (opcional)</span>
			<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" />
		</label>
		<div><Button type="submit" variant="primary" disabled={sending}>Enviar</Button></div>
		<p class="muted">Se registra a tu nombre y avisa a Promopicking.</p>
	</form>
</Drawer>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.filters .input {
		width: auto;
		max-width: 220px;
		height: 36px;
	}
	.spacer {
		flex: 1;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 32px;
		align-items: start;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	.list li {
		border-bottom: 1px solid var(--line);
	}
	.list li.current {
		background: var(--line-soft);
	}
	.list a {
		display: grid;
		gap: 6px;
		padding: 12px 8px;
		color: inherit;
		text-decoration: none;
	}
	.list a:hover {
		background: var(--line-soft);
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.mono {
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 13px;
	}
	.title {
		font-size: 14px;
	}
	small,
	.muted {
		font-size: 12px;
		color: var(--muted);
		margin: 0;
	}
	aside {
		border: 1px solid var(--line);
		padding: 16px;
		font-size: 13px;
	}
	aside h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 8px;
	}
	aside ul {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 6px;
	}
	aside b {
		font-weight: 500;
	}
	.ok {
		background: color-mix(in srgb, var(--green) 10%, transparent);
		padding: 10px 12px;
		margin: 0 0 12px;
		font-size: 13px;
	}
	.new {
		display: grid;
		gap: 14px;
	}
	.area {
		height: auto;
		padding: 8px 12px;
		resize: vertical;
	}
	@media (max-width: 1023px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
		.filters .input {
			max-width: 100%;
		}
	}
</style>
