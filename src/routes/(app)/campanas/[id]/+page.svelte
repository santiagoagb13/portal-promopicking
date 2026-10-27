<!-- Detalle de campaña: en la fase 1 solo cabecera, calendario comprometido y soportes (8.4 llega en la fase 2). -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Check from '@lucide/svelte/icons/check';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import BrandChip from '$components/domain/BrandChip.svelte';
	import Semaphore from '$components/domain/Semaphore.svelte';
	import { MILESTONE_LABEL, stageLabel, stageTone } from '$lib/domain/campaign';
	import { fmtDay, relDays } from '$lib/domain/dates';

	let { data } = $props();
	const c = $derived(data.campaign);
</script>

<div class="head">
	<Button href="/campanas" variant="ghost" icon={ChevronLeft} label="Volver a campañas" />
	<span class="id">{c.id}</span>
	<BrandChip short={c.brandShort} />
	<Chip tone={c.stageTone}>{c.stageLabel}</Chip>
	<Semaphore value={c.semaphore} />
	<span class="muted"
		>En restaurante el <b class="num">{fmtDay(c.inRestaurantOn)}</b> · {relDays(
			c.inRestaurantOn,
			data.today
		)} · {c.restaurantCount} restaurantes</span
	>
</div>

<div class="grid">
	<section>
		<h2>Soportes</h2>
		<ul class="list">
			{#each data.supports as s (s.id)}
				<li>
					<div>
						<b>{s.name}</b>
						<small
							>{s.versionsPlanned} versiones · {s.runQty.toLocaleString('es-ES')} uds · {s.packaging}</small
						>
					</div>
					<Chip tone={stageTone(s.stage)}>{stageLabel(s.stage)}</Chip>
				</li>
			{/each}
		</ul>
	</section>
	<section>
		<h2>Calendario comprometido</h2>
		<ul class="list">
			{#each data.milestones as m (m.key)}
				<li class:done={!!m.doneAt}>
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
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
	}
	.head :global(.b) {
		margin-left: -8px;
	}
	.id {
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
	}
	.muted b {
		color: var(--ink);
		font-weight: 500;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 48px;
		padding-top: 24px;
	}
	h2 {
		margin-bottom: 8px;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 40px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.list li > div,
	.grow {
		flex: 1;
		min-width: 0;
	}
	.list b {
		display: block;
		font-weight: 500;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.date {
		width: 96px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.done {
		color: var(--muted);
	}
	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: 1fr;
			gap: 32px;
		}
	}
</style>
