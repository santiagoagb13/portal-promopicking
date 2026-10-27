<!-- Administración › Ajustes (8.12): plazos por defecto de las fases y objetivo OTIF. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$components/ui/Button.svelte';
	import { MILESTONE_KEYS, MILESTONE_LABEL } from '$lib/domain/campaign';

	let { data, form } = $props();
</script>

<form
	method="POST"
	action="?/guardar"
	class="settings"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
>
	<section>
		<h2>Plazos de las fases</h2>
		<p class="hint">
			Días antes de la fecha en restaurante. Se aplican a las campañas nuevas y al cambiar la fecha
			de una campaña.
		</p>
		<div class="grid">
			{#each MILESTONE_KEYS as k (k)}
				<label class="field">
					<span>{MILESTONE_LABEL[k]}</span>
					<input
						class="input num"
						type="number"
						name="offset_{k}"
						min="0"
						max="365"
						required
						readonly={k === 'rte'}
						value={-data.settings.milestoneOffsets[k] || 0}
					/>
				</label>
			{/each}
		</div>
	</section>
	<section>
		<h2>Objetivo OTIF</h2>
		<label class="field otif"
			><span>Porcentaje</span><input
				class="input num"
				type="number"
				name="otifTarget"
				min="50"
				max="100"
				step="0.1"
				required
				value={data.settings.otifTarget}
			/></label
		>
	</section>
	{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
	<div><Button type="submit" variant="primary">Guardar ajustes</Button></div>
</form>

<style>
	.settings {
		display: grid;
		gap: 32px;
		max-width: 720px;
	}
	section {
		display: grid;
		gap: 12px;
	}
	.hint {
		font-size: 13px;
		color: var(--muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px 16px;
	}
	.otif {
		max-width: 200px;
	}
	@media (max-width: 767px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
