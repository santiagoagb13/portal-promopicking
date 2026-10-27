<script lang="ts">
	import { goto } from '$app/navigation';
	import CampaignForm from '$components/domain/CampaignForm.svelte';

	let { data, form } = $props();
</script>

<div class="page">
	<CampaignForm
		action="?/crear"
		brands={data.brands}
		owners={data.owners}
		values={form?.create?.values ?? {}}
		error={form?.create?.error}
		onclose={() => goto('/campanas')}
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
