<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Button from '$components/ui/Button.svelte';
	import { authClient, passkeyError, passkeysSupported } from '$lib/auth-client';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form } = $props();
	let name = $derived('name' in data ? (data.name ?? '') : '');
	// Sin JS se ofrece el enlace; con JS y passkeys, solo «Crear passkey» salvo que falle.
	let supported = $state<boolean | null>(null);
	let error = $state<string | null>(null);
	let busy = $state(false);

	onMount(() => {
		supported = passkeysSupported();
	});

	async function createPasskey() {
		error = null;
		if (name.trim().length < 2) {
			error = 'Escribe tu nombre';
			return;
		}
		busy = true;
		try {
			const res = await authClient.passkey.addPasskey({
				context: JSON.stringify({ t: page.params.token, n: name.trim() }),
				createSession: true
			});
			if (res?.error) error = res.error.message ?? 'No se pudo crear la passkey';
			else await goto('/campanas', { invalidateAll: true, replaceState: true });
		} catch (e) {
			error = passkeyError(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if data.state === 'pending'}
	<h1>{data.inviter} te invita como {data.access}</h1>
	<form method="POST" action="?/enlace" class="stack" use:enhance>
		<label class="field">
			<span>Correo</span>
			<input class="input" value={data.email} readonly />
		</label>
		<label class="field">
			<span>Tu nombre</span>
			<input
				class="input"
				name="name"
				bind:value={name}
				required
				minlength="2"
				autocomplete="name"
			/>
		</label>
		{#if supported}
			<Button variant="primary" size={44} icon={KeyRound} onclick={createPasskey} disabled={busy}
				>Crear passkey</Button
			>
		{/if}
		{#if error || form?.error}<p class="field-error" role="alert">{error ?? form?.error}</p>{/if}
		{#if supported === false || error}
			{#if supported === false}<p class="alert">
					Este navegador no admite passkeys. Te enviamos un enlace de acceso; podrás registrar una
					passkey después.
				</p>{/if}
			<Button type="submit" variant={supported ? 'neutral' : 'primary'} size={44}
				>Recibir enlace de acceso</Button
			>
		{:else if supported === null}
			<noscript
				><Button type="submit" variant="primary" size={44}>Recibir enlace de acceso</Button
				></noscript
			>
		{/if}
	</form>
	<p class="lead">Caduca el {fmtDateTime(data.expiresAt)}.</p>
{:else if data.state === 'expired'}
	<h1>La invitación ha caducado</h1>
	<p class="lead">{data.inviter} puede enviarte una nueva.</p>
	{#if form?.toast}
		<p>Hemos avisado a {data.inviter}.</p>
	{:else}
		<form method="POST" action="?/renovar" use:enhance>
			<Button type="submit" variant="primary" size={44}>Pedir una invitación nueva</Button>
		</form>
	{/if}
{:else if data.state === 'used'}
	<h1>Esta invitación ya se usó</h1>
	<Button href="/acceso" variant="primary" size={44}>Ir al acceso</Button>
{:else}
	<h1>Este enlace no es válido</h1>
	<p class="lead">Pide a quien te invitó que te envíe otro.</p>
	<Button href="/acceso" size={44}>Ir al acceso</Button>
{/if}
