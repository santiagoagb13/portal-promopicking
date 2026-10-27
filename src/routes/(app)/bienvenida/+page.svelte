<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Button from '$components/ui/Button.svelte';
	import { useToaster } from '$components/ui/toast.svelte';
	import { authClient, passkeyError, passkeysSupported } from '$lib/auth-client';

	let { data } = $props();
	const toaster = useToaster();
	let supported = $state(true);
	let error = $state<string | null>(null);
	let busy = $state(false);

	onMount(() => {
		supported = passkeysSupported();
	});

	async function add() {
		error = null;
		busy = true;
		try {
			const res = await authClient.passkey.addPasskey();
			if (res?.error) error = res.error.message ?? 'No se pudo crear la passkey';
			else {
				toaster.show('Passkey creada', { tone: 'green' });
				await goto(data.back, { invalidateAll: true });
			}
		} catch (e) {
			error = passkeyError(e);
		} finally {
			busy = false;
		}
	}
</script>

<section class="welcome">
	<KeyRound size={32} strokeWidth={1.25} />
	<h2>¿Crear una passkey en este dispositivo?</h2>
	<p class="muted">
		La próxima vez entrarás con Face ID, Touch ID o Windows Hello, sin esperar un correo.
		{#if data.passkeys}Ya tienes {data.passkeys} en otros dispositivos.{/if}
	</p>
	{#if error}<p class="field-error" role="alert">{error}</p>{/if}
	<div class="acts">
		{#if supported}<Button variant="primary" icon={KeyRound} onclick={add} disabled={busy}>Crear passkey</Button>{/if}
		<Button href={data.back}>Ahora no</Button>
	</div>
</section>

<style>
	.welcome {
		max-width: 440px;
		display: grid;
		gap: 12px;
		padding: 32px 0;
	}
	.muted {
		color: var(--muted);
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
</style>
