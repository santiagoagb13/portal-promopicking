<!--
	Confirmación a pantalla completa (7.1, regla 4): en móvil y con lector, el resultado de cada
	escaneo o recepción ocupa la pantalla, vibra y suena; se cierra solo o al tocar.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';

	export type Result = { tone: 'green' | 'amber' | 'red'; title: string; lines: string[] };
	let { result = $bindable(null) }: { result: Result | null } = $props();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function feedback(tone: Result['tone']) {
		navigator.vibrate?.(tone === 'green' ? 120 : [80, 60, 80]);
		try {
			const ctx = new AudioContext();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = tone === 'green' ? 880 : 330;
			gain.gain.value = 0.08;
			osc.connect(gain).connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + (tone === 'green' ? 0.12 : 0.3));
		} catch {
			/* sin audio */
		}
	}

	$effect(() => {
		if (!result) return;
		feedback(result.tone);
		clearTimeout(timer);
		timer = setTimeout(() => (result = null), result.tone === 'green' ? 1800 : 3500);
		return () => clearTimeout(timer);
	});
</script>

{#if result}
	{@const Icon = result.tone === 'green' ? Check : result.tone === 'amber' ? WifiOff : CircleAlert}
	<button
		type="button"
		class="full {result.tone}"
		onclick={() => (result = null)}
		aria-live="assertive"
	>
		<Icon size={72} strokeWidth={1.5} aria-hidden="true" />
		<b>{result.title}</b>
		{#each result.lines as line, i (i)}<span>{line}</span>{/each}
		<small>Toca para seguir</small>
	</button>
{/if}

<style>
	.full {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 12px;
		padding: 24px;
		border: 0;
		font: inherit;
		text-align: center;
		color: #fff;
	}
	.green {
		background: var(--green);
	}
	.amber {
		background: var(--amber);
		color: var(--on-amber);
	}
	.red {
		background: var(--red);
	}
	b {
		font-size: 28px;
		font-weight: 600;
		font-family: var(--font-mono);
		overflow-wrap: anywhere;
	}
	span {
		font-size: 18px;
	}
	small {
		margin-top: 24px;
		opacity: 0.8;
	}
</style>
