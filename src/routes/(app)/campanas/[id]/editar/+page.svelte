<script lang="ts">
	import { goto } from '$app/navigation';
	import CampaignForm from '$components/domain/CampaignForm.svelte';

	let { data, form } = $props();
	const c = $derived(data.campaign);
</script>

<div class="page">
	<CampaignForm
		edit
		action="?"
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
		onclose={() => goto(`/campanas/${c.id}`)}
	/>
</div>

<style>
	.page {
		max-width: 480px;
	}
	.page :global(.form) {
		display: grid;
		gap: 16px;
	}
	.page :global(.row2) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.page :global(.actions) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
</style>
