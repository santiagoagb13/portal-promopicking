<script lang="ts">
	import { page } from '$app/state';
	import Segmented from '$components/ui/Segmented.svelte';

	let { data, children } = $props();
	const items = $derived(
		data.adminTabs.map((t) => ({
			href: t.href,
			label: t.label,
			active: page.url.pathname.startsWith(t.href)
		}))
	);
</script>

{#if items.length > 1}
	<div class="tabs"><Segmented label="Administración" {items} /></div>
{/if}
{@render children()}

<style>
	.tabs {
		padding-bottom: 16px;
		max-width: 100%;
		overflow-x: auto;
	}
</style>
