<!-- Formulario de campaña (alta y edición), dentro de un panel lateral. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$components/ui/Button.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Brand = { code: string; label: string; restaurantCount: number };
	type Props = {
		action: string;
		brands: Brand[];
		owners: { id: string; name: string; brandCode: string }[];
		values?: Record<string, string | number | boolean | null | undefined>;
		error?: string | null;
		edit?: boolean;
		onclose: () => void;
	};
	let { action, brands, owners, values = {}, error, edit = false, onclose }: Props = $props();

	let brand = $derived(String(values.brandCode ?? (brands.length === 1 ? brands[0]!.code : '')));
	let restaurants = $derived(
		values.restaurantCount ?? brands.find((b) => b.code === brand)?.restaurantCount ?? ''
	);
	const ownersOfBrand = $derived(owners.filter((o) => o.brandCode === brand));
	const checked = (v: unknown) => v === true || v === 'on' || v === 'true';

	// El error puede venir del servidor (sin JS) o del resultado de la acción (con JS).
	let shownError = $derived(error ?? null);
	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				const data = result.data as
					{ create?: { error?: string }; edit?: { error?: string } } | undefined;
				shownError = data?.create?.error ?? data?.edit?.error ?? 'Revisa los datos';
				return;
			}
			if (result.type === 'success' || result.type === 'redirect') onclose();
			await update({ reset: false });
		};
</script>

<form method="POST" {action} class="form" use:enhance={submit}>
	<label class="field">
		<span>Marca</span>
		<select class="input" name="brandCode" required bind:value={brand} disabled={edit}>
			{#if !edit && brands.length > 1}<option value="" disabled>Elige una marca</option>{/if}
			{#each brands as b (b.code)}<option value={b.code}>{b.label}</option>{/each}
		</select>
		{#if edit}<input type="hidden" name="brandCode" value={brand} />{/if}
	</label>
	<label class="field">
		<span>Nombre</span>
		<input
			class="input"
			name="name"
			required
			minlength="2"
			maxlength="120"
			value={values.name ?? ''}
		/>
	</label>
	<div class="row2">
		<label class="field">
			<span>En restaurante</span>
			<input
				class="input"
				type="date"
				name="inRestaurantOn"
				required
				value={values.inRestaurantOn ?? ''}
			/>
		</label>
		<label class="field">
			<span>Restaurantes</span>
			<input
				class="input"
				type="number"
				name="restaurantCount"
				required
				min="1"
				max="2000"
				bind:value={restaurants}
			/>
		</label>
	</div>
	<label class="field">
		<span>Responsable de marca</span>
		<select class="input" name="ownerUserId" value={values.ownerUserId ?? ''}>
			<option value="">Sin asignar</option>
			{#each ownersOfBrand as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
		</select>
	</label>
	<label class="field">
		<span>Materiales</span>
		<input class="input" name="materials" maxlength="400" value={values.materials ?? ''} />
	</label>
	<label class="field">
		<span>Notas</span>
		<textarea class="input area" name="notes" maxlength="600" rows="3"
			>{values.notes ?? ''}</textarea
		>
	</label>
	<label class="check"
		><input type="checkbox" name="planned" checked={checked(values.planned)} />Planificada (sin
		brief todavía)</label
	>
	{#if !edit}<p class="hint">
			Los hitos se calculan hacia atrás desde la fecha en restaurante con los plazos de Ajustes.
		</p>{/if}
	{#if shownError}<p class="field-error" role="alert">{shownError}</p>{/if}
	<div class="actions">
		<Button type="button" onclick={onclose}>Cancelar</Button>
		<Button type="submit" variant="primary">{edit ? 'Guardar' : 'Crear campaña'}</Button>
	</div>
</form>

<style>
	.area {
		height: auto;
		padding: 8px 12px;
		resize: vertical;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
	}
</style>
