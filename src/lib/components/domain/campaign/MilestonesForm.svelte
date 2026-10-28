<!-- Calendario comprometido de la campaña (8.3): una fecha por hito; la de restaurante no cambia aquí. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$components/ui/Button.svelte';
	import { closeOnSuccess } from '$components/ui/forms';
	import { MILESTONE_KEYS, MILESTONE_LABEL } from '$lib/domain/campaign';

	type Props = {
		due: Record<string, { dueOn?: string | null } | undefined>;
		action: string;
		error?: string;
		onsaved: () => void;
		onclose: () => void;
	};
	let { due, action, error, onsaved, onclose }: Props = $props();
</script>

<form method="POST" {action} class="form" use:enhance={closeOnSuccess(onsaved)}>
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
	{#if error}<p class="field-error" role="alert">{error}</p>{/if}
	<div class="actions">
		<Button type="button" onclick={onclose}>Cancelar</Button>
		<Button type="submit" variant="primary">Guardar</Button>
	</div>
</form>

<style>
	.form {
		display: grid;
		gap: 16px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
