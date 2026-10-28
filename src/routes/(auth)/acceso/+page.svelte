<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Button from '$components/ui/Button.svelte';
	import { authClient, passkeyError, passkeysSupported } from '$lib/auth-client';

	let { data, form } = $props();
	let error = $state<string | null>(null);
	let supported = $state(false);
	let busy = $state(false);

	async function finish(res: { error?: unknown } | undefined | null) {
		if (res && !res.error) await goto(data.back, { invalidateAll: true });
	}

	onMount(() => {
		supported = passkeysSupported();
		// Autocompletado condicional: el navegador ofrece la passkey en el campo de correo.
		if (supported && PublicKeyCredential.isConditionalMediationAvailable)
			PublicKeyCredential.isConditionalMediationAvailable().then((ok) => {
				if (ok)
					authClient.signIn
						.passkey({ autoFill: true })
						.then(finish)
						.catch(() => {});
			});
	});

	async function signIn() {
		error = null;
		busy = true;
		try {
			const res = await authClient.signIn.passkey();
			if (res?.error) error = 'No reconocemos esa passkey. Prueba con un enlace.';
			else await finish(res);
		} catch (e) {
			error = passkeyError(e);
		} finally {
			busy = false;
		}
	}
</script>

<h1>Acceso</h1>
{#if data.linkError}<p class="alert" role="alert">El enlace caducó o ya se usó. Pide otro.</p>{/if}
<form method="POST" action="?/enlace" class="stack">
	<input type="hidden" name="volver" value={data.back} />
	<label class="field">
		<span>Correo</span>
		<input
			class="input"
			type="email"
			name="email"
			required
			autocomplete="username webauthn"
			inputmode="email"
			value={form?.email ?? ''}
			aria-invalid={form?.error ? 'true' : undefined}
			aria-describedby={form?.error ? 'email-error' : undefined}
		/>
		{#if form?.error}<span class="field-error" id="email-error">{form.error}</span>{/if}
	</label>
	{#if supported}
		<Button variant="primary" size={44} icon={KeyRound} onclick={signIn} disabled={busy}
			>Entrar con passkey</Button
		>
	{/if}
	{#if error}<p class="field-error" role="alert">{error}</p>{/if}
	<button class="linkish" type="submit">Enviarme un enlace</button>
</form>
<p class="legal"><a href="/aviso-legal">Aviso legal y privacidad</a></p>

<style>
	.legal {
		font-size: 12px;
		color: var(--muted);
		margin: 16px 0 0;
	}
	.legal a {
		color: inherit;
	}
</style>
