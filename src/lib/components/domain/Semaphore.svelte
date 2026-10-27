<!-- Semáforo (7.4): punto de 10 px con el motivo en tooltip y como nombre accesible. -->
<script lang="ts">
	import { SEMAPHORE_REASON, type Semaphore } from '$lib/domain/campaign';

	let { value, reason }: { value: Semaphore; reason?: string } = $props();
	const text = $derived(reason ?? SEMAPHORE_REASON[value]);
</script>

<!-- El punto es enfocable para que el motivo (tooltip) llegue también con teclado. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span class="dot {value}" role="img" aria-label={text} data-tip={text} tabindex="0"></span>

<style>
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
		vertical-align: middle;
		background: var(--line);
	}
	.verde {
		background: var(--green);
	}
	.ambar {
		background: var(--amber);
	}
	.rojo {
		background: var(--red);
	}
</style>
