<script lang="ts">
	import { page } from '$app/state';
	import Sidebar from '$components/shell/Sidebar.svelte';
	import TabBar from '$components/shell/TabBar.svelte';
	import TopBar from '$components/shell/TopBar.svelte';
	import { NAV } from '$lib/nav';

	let { data, children } = $props();
	const items = $derived(NAV.filter((n) => data.nav.includes(n.href)));
	const tabs = $derived(data.tabs.map((h) => NAV.find((n) => n.href === h)!));
</script>

<Sidebar {items} counts={data.counts} user={data.user} />
<div class="main">
	<TopBar title={page.data.title ?? ''} unread={data.unread} theme={data.theme} user={data.user} />
	<main class="content" id="contenido">
		{@render children()}
	</main>
</div>
<TabBar {tabs} counts={data.counts} />

<style>
	.main {
		margin-left: var(--sbw);
		min-width: 0;
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.content {
		padding: 24px;
		max-width: var(--content);
		width: 100%;
	}
	@media (max-width: 1279px) {
		:global(:root) {
			--sbw: 72px;
		}
	}
	@media (max-width: 767px) {
		:global(:root) {
			--sbw: 0px;
		}
		.main {
			margin: 0;
			padding-bottom: calc(var(--tab) + env(safe-area-inset-bottom));
		}
		.content {
			padding: 16px;
		}
	}
</style>
