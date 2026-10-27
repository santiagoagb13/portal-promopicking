<!--
	Botón (7.4): variantes principal, neutro, verde, ámbar, rojo y fantasma; tamaños 32/36/44.
	Sin texto es un icono de acción: `label` es obligatorio y se usa como aria-label y tooltip.
-->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'neutral' | 'green' | 'amber' | 'red' | 'ghost';
	type Props = Omit<HTMLButtonAttributes, 'children' | 'onclick'> & {
		onclick?: (e: MouseEvent) => void;
		variant?: Variant;
		size?: 32 | 36 | 44;
		icon?: Component<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;
		/** Nombre accesible y tooltip; obligatorio en los botones de solo icono. */
		label?: string;
		href?: string;
		tipPos?: 'left';
		children?: Snippet;
	};

	let {
		variant = 'neutral',
		size = 36,
		icon: Icon,
		label,
		href,
		tipPos,
		children,
		onclick,
		class: klass = '',
		type = 'button',
		...rest
	}: Props = $props();

	const iconOnly = $derived(!children);
	const cls = $derived(
		['b', iconOnly ? 'ib' : 'btn', `v-${variant}`, `s-${size}`, klass].filter(Boolean).join(' ')
	);
</script>

{#snippet inner()}
	{#if Icon}<Icon size={size === 32 ? 16 : 20} strokeWidth={1.5} aria-hidden={true} />{/if}
	{@render children?.()}
{/snippet}

{#if href}
	<a
		{href}
		class={cls}
		aria-label={iconOnly ? label : undefined}
		data-tip={iconOnly ? label : undefined}
		data-tip-pos={tipPos}
		{onclick}
	>
		{@render inner()}
	</a>
{:else}
	<button
		{type}
		class={cls}
		aria-label={iconOnly ? label : undefined}
		data-tip={iconOnly ? label : undefined}
		data-tip-pos={tipPos}
		{onclick}
		{...rest}
	>
		{@render inner()}
	</button>
{/if}

<style>
	.b {
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		white-space: nowrap;
		text-decoration: none;
		transition:
			background var(--t),
			color var(--t),
			border-color var(--t),
			filter var(--t);
	}
	.b:hover {
		background: var(--line-soft);
	}
	.s-32 {
		height: 32px;
		font-size: 13px;
	}
	.s-44 {
		height: 44px;
	}
	.ib {
		width: 36px;
		padding: 0;
	}
	.ib.s-32 {
		width: 32px;
	}
	.ib.s-44 {
		width: 44px;
	}
	.v-ghost {
		border-color: transparent;
		background: transparent;
	}
	.v-primary {
		background: var(--primary);
		color: var(--on-primary);
		border-color: var(--primary);
	}
	.btn.v-green {
		background: var(--green);
		color: #fff;
		border-color: var(--green);
	}
	.btn.v-amber {
		background: var(--amber);
		color: var(--on-amber);
		border-color: var(--amber);
	}
	.btn.v-red {
		background: var(--red);
		color: #fff;
		border-color: var(--red);
	}
	.v-primary:hover,
	.btn.v-green:hover,
	.btn.v-amber:hover,
	.btn.v-red:hover {
		filter: brightness(1.1);
	}
	.v-primary:hover {
		background: var(--primary);
	}
	.btn.v-green:hover {
		background: var(--green);
	}
	.btn.v-amber:hover {
		background: var(--amber);
	}
	.btn.v-red:hover {
		background: var(--red);
	}
	/* Iconos de acción: el color está en el icono, el fondo solo se tiñe al pasar. */
	.ib.v-green {
		color: var(--green);
	}
	.ib.v-amber {
		color: var(--amber);
	}
	.ib.v-red {
		color: var(--red);
	}
	.ib.v-green:hover {
		background: color-mix(in srgb, var(--green) 12%, transparent);
	}
	.ib.v-amber:hover {
		background: color-mix(in srgb, var(--amber) 12%, transparent);
	}
	.ib.v-red:hover {
		background: color-mix(in srgb, var(--red) 12%, transparent);
	}
	.b:disabled,
	.b[aria-disabled='true'] {
		opacity: 0.4;
		cursor: default;
		filter: none;
	}
	@media (max-width: 767px) {
		.b {
			min-height: 44px;
			min-width: 44px;
		}
		.ib {
			width: 44px;
		}
	}
</style>
