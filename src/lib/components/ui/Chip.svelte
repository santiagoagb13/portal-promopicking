<!-- Chip de estado (7.4): rectangular, radio 2 px, 12 px; fondo tenue y texto fuerte. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ChipTone } from '$lib/domain/campaign';

	let { tone = '', children }: { tone?: ChipTone; children: Snippet } = $props();
</script>

<span class="chip {tone}">{@render children()}</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		height: 22px;
		padding: 0 8px;
		border-radius: 2px;
		font-size: 12px;
		font-weight: 400;
		white-space: nowrap;
		background: var(--line-soft);
		color: var(--ink);
	}
	.green {
		background: color-mix(in srgb, var(--green) 14%, transparent);
		color: var(--green-ink);
	}
	.amber {
		background: var(--amber-bg);
		color: var(--amber-ink);
	}
	.red {
		background: color-mix(in srgb, var(--red) 12%, transparent);
		color: var(--red);
	}
	.primary {
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		color: var(--primary);
	}
	.info {
		background: color-mix(in srgb, var(--info) 12%, transparent);
		color: var(--info);
	}
	.outline {
		background: transparent;
		border: 1px solid var(--line);
		color: var(--muted);
	}
</style>
