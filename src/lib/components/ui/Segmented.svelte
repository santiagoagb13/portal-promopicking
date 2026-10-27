<!-- Segmentos de filtro (7.4): enlaces, para que el filtro viva en la URL y funcione sin JS. -->
<script lang="ts">
	import type { Component } from 'svelte';

	type Item = {
		href: string;
		label: string;
		active: boolean;
		count?: number;
		/** Con icono, el texto pasa a tooltip y nombre accesible. */
		icon?: Component<{ size?: number; strokeWidth?: number }>;
	};
	let {
		items,
		label,
		size = 'md'
	}: { items: Item[]; label: string; size?: 'md' | 'mini' } = $props();
</script>

<nav class="seg {size}" aria-label={label}>
	{#each items as item (item.href)}
		<a
			href={item.href}
			aria-current={item.active ? 'true' : undefined}
			data-sveltekit-noscroll
			data-sveltekit-replacestate
			aria-label={item.icon ? item.label : undefined}
			data-tip={item.icon ? item.label : undefined}
			>{#if item.icon}<item.icon
					size={18}
					strokeWidth={1.5}
				/>{:else}{item.label}{/if}{#if item.count}<span class="count">{item.count}</span>{/if}</a
		>
	{/each}
</nav>

<style>
	.seg {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		overflow: hidden;
		max-width: 100%;
	}
	a {
		height: 34px;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-weight: 500;
		white-space: nowrap;
		transition:
			background var(--t),
			color var(--t);
	}
	a + a {
		border-left: 1px solid var(--line);
	}
	a:hover {
		color: var(--ink);
	}
	a[aria-current='true'] {
		background: var(--seg-on);
		color: var(--seg-on-ink);
	}
	.mini a {
		height: 28px;
		padding: 0 10px;
		font-size: 12px;
	}
	.count {
		font-size: 10px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		display: inline-grid;
		place-items: center;
		background: var(--line-soft);
		color: var(--ink);
		border-radius: 2px;
	}
	@media (max-width: 767px) {
		a {
			height: 42px;
		}
		.mini a {
			height: 36px;
		}
	}
</style>
