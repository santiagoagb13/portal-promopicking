<!-- Alta o edición de un soporte de la campaña (8.3). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$components/ui/Button.svelte';
	import { closeOnSuccess } from '$components/ui/forms';
	import { STAGES } from '$lib/domain/campaign';

	type Props = {
		editingId: string | null;
		values: Record<string, string | number | null | undefined>;
		action: string;
		error?: string;
		onsaved: () => void;
		onclose: () => void;
	};
	let { editingId, values, action, error, onsaved, onclose }: Props = $props();
</script>

<form method="POST" {action} class="form" use:enhance={closeOnSuccess(onsaved)}>
	{#if editingId}<input type="hidden" name="id" value={editingId} />{/if}
	<label class="field">
		<span>Nombre</span>
		<input
			class="input"
			name="name"
			required
			minlength="2"
			maxlength="160"
			value={values.name ?? ''}
		/>
	</label>
	<div class="row2">
		<label class="field">
			<span>Versiones</span>
			<input
				class="input"
				type="number"
				name="versionsPlanned"
				min="0"
				required
				value={values.versionsPlanned ?? 0}
			/>
		</label>
		<label class="field">
			<span>Tirada (uds)</span>
			<input
				class="input"
				type="number"
				name="runQty"
				min="0"
				required
				value={values.runQty ?? 0}
			/>
		</label>
	</div>
	<div class="row2">
		<label class="field">
			<span>Uds por kit</span>
			<input class="input" type="number" name="perKitQty" min="1" value={values.perKitQty ?? ''} />
		</label>
		<label class="field">
			<span>Fase</span>
			<select class="input" name="stage" value={String(values.stage ?? 0)}>
				{#each STAGES as s, i (s)}<option value={String(i)}>{s}</option>{/each}
			</select>
		</label>
	</div>
	<label class="field">
		<span>Empaquetado</span>
		<input class="input" name="packaging" maxlength="160" value={values.packaging ?? ''} />
	</label>
	<label class="field">
		<span>Responsable</span>
		<input class="input" name="responsible" maxlength="160" value={values.responsible ?? ''} />
	</label>
	<label class="field">
		<span>Notas</span>
		<input class="input" name="notes" maxlength="400" value={values.notes ?? ''} />
	</label>
	{#if error}<p class="field-error" role="alert">{error}</p>{/if}
	<div class="actions">
		<Button type="button" onclick={onclose}>Cancelar</Button>
		<Button type="submit" variant="primary">{editingId ? 'Guardar' : 'Añadir soporte'}</Button>
	</div>
</form>

<style>
	.form {
		display: grid;
		gap: 16px;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
