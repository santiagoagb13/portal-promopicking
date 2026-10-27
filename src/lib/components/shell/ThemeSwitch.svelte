<!-- Conmutador de tema sistema / claro / oscuro. Formulario normal; con JS no recarga la página. -->
<script lang="ts">
	import Monitor from '@lucide/svelte/icons/monitor';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { page } from '$app/state';
	import { THEME_LABEL } from '$lib/i18n/es';
	import type { Theme } from '$lib/schemas/auth';

	let { current, labels = false }: { current: Theme; labels?: boolean } = $props();
	let theme = $state<Theme>('system');
	$effect.pre(() => {
		theme = current;
	});
	const options = [
		{ value: 'system', icon: Monitor },
		{ value: 'light', icon: Sun },
		{ value: 'dark', icon: Moon }
	] as const;

	async function choose(e: SubmitEvent) {
		const value = (e.submitter as HTMLButtonElement | null)?.value as Theme | undefined;
		if (!value) return;
		e.preventDefault();
		theme = value;
		document.documentElement.dataset.theme = value;
		await fetch('/tema', {
			method: 'POST',
			headers: { accept: 'application/json' },
			body: new URLSearchParams({ tema: value })
		});
	}
</script>

<form method="POST" action="/tema" class="theme" class:labels onsubmit={choose}>
	<input type="hidden" name="volver" value={page.url.pathname + page.url.search} />
	{#each options as o (o.value)}
		<button
			type="submit"
			name="tema"
			value={o.value}
			aria-pressed={theme === o.value}
			aria-label={THEME_LABEL[o.value]}
			data-tip={labels ? undefined : THEME_LABEL[o.value]}
		>
			<o.icon size={16} strokeWidth={1.5} aria-hidden={true} />
			{#if labels}<span>{THEME_LABEL[o.value]}</span>{/if}
		</button>
	{/each}
</form>

<style>
	.theme {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
	}
	button {
		height: 32px;
		min-width: 36px;
		padding: 0 10px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-weight: 500;
	}
	button + button {
		border-left: 1px solid var(--line);
	}
	button[aria-pressed='true'] {
		background: var(--seg-on);
		color: var(--seg-on-ink);
	}
	@media (max-width: 767px) {
		button {
			height: 44px;
			min-width: 44px;
		}
	}
</style>
