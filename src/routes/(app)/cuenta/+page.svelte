<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Plus from '@lucide/svelte/icons/plus';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import { useToaster } from '$components/ui/toast.svelte';
	import ThemeSwitch from '$components/shell/ThemeSwitch.svelte';
	import { authClient, passkeyError } from '$lib/auth-client';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form } = $props();
	const toaster = useToaster();
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	let busy = $state(false);

	function open(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}

	async function addPasskey() {
		busy = true;
		try {
			const res = await authClient.passkey.addPasskey();
			if (res?.error) toaster.show(res.error.message ?? 'No se pudo crear', { tone: 'red' });
			else {
				toaster.show('Passkey creada', { tone: 'green' });
				await invalidate('app:cuenta');
			}
		} catch (e) {
			toaster.show(passkeyError(e), { tone: 'amber' });
		} finally {
			busy = false;
		}
	}
</script>

<div class="sections">
	<section>
		<h2>Datos</h2>
		<dl>
			<dt>Nombre</dt>
			<dd>{data.profile.name}</dd>
			<dt>Correo</dt>
			<dd>{data.profile.email}</dd>
			<dt>Acceso</dt>
			<dd>{data.profile.access}</dd>
		</dl>
	</section>

	<section>
		<h2>Tema</h2>
		<ThemeSwitch current={data.theme} labels />
	</section>

	<section>
		<div class="h">
			<h2>Passkeys</h2>
			<Button
				variant="primary"
				icon={Plus}
				label="Añadir passkey en este dispositivo"
				tipPos="left"
				onclick={addPasskey}
				disabled={busy}
			/>
		</div>
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		{#if data.passkeys.length}
			<ul class="list">
				{#each data.passkeys as k (k.id)}
					<li>
						<KeyRound size={20} strokeWidth={1.5} aria-hidden="true" />
						<div class="grow">
							<b>{k.name ?? 'Passkey'}</b>
							<small
								>Creada {fmtDateTime(k.createdAt)} · {k.lastUsedAt
									? `último uso ${fmtDateTime(k.lastUsedAt)}`
									: 'sin usar'}</small
							>
						</div>
						<Button
							href="?confirmar=renombrar-{k.id}"
							variant="ghost"
							icon={Pencil}
							label="Renombrar"
							onclick={(e: MouseEvent) => open(e, `renombrar-${k.id}`)}
						/>
						<Button
							href="?confirmar=borrar-{k.id}"
							variant="red"
							icon={Trash2}
							label="Eliminar"
							tipPos="left"
							onclick={(e: MouseEvent) => open(e, `borrar-${k.id}`)}
						/>
						<ConfirmDialog
							bind:this={dialogs[`renombrar-${k.id}`]}
							id="renombrar-{k.id}"
							title="¿Renombrar la passkey?"
							confirmLabel="Guardar"
							action="?/renombrar"
							fields={{ id: k.id }}
							initiallyOpen={confirmar === `renombrar-${k.id}`}
						>
							<label class="field"
								><span>Nombre</span><input
									class="input"
									name="name"
									value={k.name ?? ''}
									maxlength="60"
									required
								/></label
							>
						</ConfirmDialog>
						<ConfirmDialog
							bind:this={dialogs[`borrar-${k.id}`]}
							id="borrar-{k.id}"
							title="¿Eliminar la passkey «{k.name ?? 'Passkey'}»?"
							description={data.passkeys.length === 1
								? 'Es la única: solo podrás entrar con un enlace por correo.'
								: 'Ese dispositivo dejará de servir para entrar.'}
							confirmLabel="Eliminar"
							tone="red"
							action="?/borrarPasskey"
							fields={{ id: k.id }}
							initiallyOpen={confirmar === `borrar-${k.id}`}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Aún no tienes passkeys: entras con enlace por correo.</p>
		{/if}
	</section>

	<section>
		<div class="h">
			<h2>Sesiones activas</h2>
			{#if data.sessions.length > 1}
				<Button
					href="?confirmar=cerrar-otras"
					variant="red"
					icon={LogOut}
					label="Cerrar las demás sesiones"
					tipPos="left"
					onclick={(e: MouseEvent) => open(e, 'cerrar-otras')}
				/>
				<ConfirmDialog
					bind:this={dialogs['cerrar-otras']}
					id="cerrar-otras"
					title="¿Cerrar las otras {data.sessions.length - 1} sesiones?"
					confirmLabel="Cerrar sesiones"
					tone="red"
					action="?/cerrarOtras"
					initiallyOpen={confirmar === 'cerrar-otras'}
				/>
			{/if}
		</div>
		<ul class="list">
			{#each data.sessions as s (s.id)}
				<li>
					<div class="grow">
						<b
							>{s.device}{#if s.current}&nbsp;<Chip tone="green">Esta sesión</Chip>{/if}</b
						>
						<small>Última actividad {fmtDateTime(s.updatedAt)}{s.ip ? ` · ${s.ip}` : ''}</small>
					</div>
					{#if !s.current}
						<Button
							href="?confirmar=sesion-{s.id}"
							variant="red"
							icon={LogOut}
							label="Cerrar sesión"
							tipPos="left"
							onclick={(e: MouseEvent) => open(e, `sesion-${s.id}`)}
						/>
						<ConfirmDialog
							bind:this={dialogs[`sesion-${s.id}`]}
							id="sesion-{s.id}"
							title="¿Cerrar la sesión de {s.device}?"
							confirmLabel="Cerrar sesión"
							tone="red"
							action="?/cerrarSesion"
							fields={{ id: s.id }}
							initiallyOpen={confirmar === `sesion-${s.id}`}
						/>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.sections {
		display: grid;
		gap: 32px;
		max-width: 720px;
	}
	section {
		display: grid;
		gap: 12px;
	}
	.h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	dl {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr);
		gap: 8px 16px;
		border-top: 1px solid var(--line);
		padding-top: 12px;
	}
	dt {
		color: var(--muted);
		font-size: 13px;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--line);
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	b {
		display: flex;
		align-items: center;
		gap: 4px;
		font-weight: 500;
		flex-wrap: wrap;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	@media (max-width: 479px) {
		dl {
			grid-template-columns: 1fr;
			gap: 2px;
		}
		dd {
			margin-bottom: 8px;
		}
	}
</style>
