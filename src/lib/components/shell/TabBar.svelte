<!-- Barra inferior en móvil (8.2): cuatro destinos según el rol y «Más». -->
<script lang="ts">
	import { page } from '$app/state';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { isActive, type NavItem } from '$lib/nav';

	let { tabs, counts }: { tabs: NavItem[]; counts: { pending: number; incidents: number } } =
		$props();
	const moreActive = $derived(!tabs.some((t) => isActive(t.href, page.url.pathname)));
</script>

<nav class="tabbar" aria-label="Navegación">
	{#each tabs as t (t.href)}
		{@const active = isActive(t.href, page.url.pathname)}
		{@const n = t.count ? counts[t.count] : 0}
		<a href={t.href} class:active aria-current={active ? 'page' : undefined}>
			<t.icon size={20} strokeWidth={1.5} aria-hidden={true} />
			<span>{t.short}</span>
			{#if n}<span class="count" class:warn={t.count === 'pending'}>{n}</span>{/if}
		</a>
	{/each}
	<a href="/mas" class:active={moreActive} aria-current={moreActive ? 'page' : undefined}>
		<Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
		<span>Más<span class="sr-only">&nbsp;secciones</span></span>
	</a>
</nav>

<style>
	.tabbar {
		display: none;
	}
	@media (max-width: 767px) {
		.tabbar {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			height: calc(var(--tab) + env(safe-area-inset-bottom));
			padding-bottom: env(safe-area-inset-bottom);
			border-top: 1px solid var(--line);
			background: var(--surface);
			z-index: 30;
		}
		a {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 3px;
			font-size: 10px;
			color: var(--muted);
			position: relative;
			min-width: 0;
		}
		a span:not(.count) {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		a.active {
			color: var(--primary);
		}
		.count {
			position: absolute;
			top: 6px;
			left: calc(50% + 4px);
			transform: scale(0.85);
			min-width: 18px;
			height: 18px;
			padding: 0 5px;
			display: inline-grid;
			place-items: center;
			font-size: 11px;
			font-weight: 600;
			background: var(--line-soft);
			color: var(--ink);
			border-radius: 2px;
		}
		.count.warn {
			background: var(--amber);
			color: var(--on-amber);
		}
	}
</style>
