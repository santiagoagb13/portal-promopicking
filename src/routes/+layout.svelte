<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import Toasts from '$components/ui/Toasts.svelte';
	import { provideToaster } from '$components/ui/toast.svelte';

	let { children } = $props();
	const toaster = provideToaster();
	const title = $derived(page.data.title ? `${page.data.title} · Portal Promopicking` : 'Portal Promopicking');
	const formToast = $derived((page.form as { toast?: string } | null)?.toast ?? null);

	// Respuesta de una acción con `use:enhance`: se muestra como aviso.
	let shown: unknown = null;
	$effect(() => {
		if (formToast && page.form !== shown) {
			shown = page.form;
			toaster.show(formToast, { tone: 'green' });
		}
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

{@render children()}
<Toasts {toaster} initial={formToast} />
