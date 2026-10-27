<!-- Estado vacío (7.4): icono + una frase + acción opcional. -->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	let {
		icon: Icon,
		text,
		children
	}: { icon: Component<{ size?: number; strokeWidth?: number }>; text: string; children?: Snippet } =
		$props();
</script>

<div class="empty">
	<Icon size={32} strokeWidth={1.25} />
	<p>{text}</p>
	{#if children}<div class="act">{@render children()}</div>{/if}
</div>

<style>
	.empty {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 64px 16px;
		color: var(--muted);
		text-align: center;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	p {
		color: var(--ink);
		max-width: 36ch;
	}
</style>
