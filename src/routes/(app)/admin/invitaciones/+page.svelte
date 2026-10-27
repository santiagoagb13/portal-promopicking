<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Send from '@lucide/svelte/icons/send';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Ban from '@lucide/svelte/icons/ban';
	import MailPlus from '@lucide/svelte/icons/mail-plus';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form } = $props();
	type Row = (typeof data.invitations)[number];

	let role = $state('');
	$effect.pre(() => {
		role = form?.create?.values.role ?? (data.roles.length === 1 ? data.roles[0]!.value : '');
	});
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	function open(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}

	const columns = [
		{ key: 'who', label: 'Invitación', card: 'title' as const },
		{ key: 'access', label: 'Acceso', card: 'subtitle' as const },
		{ key: 'by', label: 'Enviada por' },
		{ key: 'sent', label: 'Enviada' },
		{ key: 'expires', label: 'Caduca' },
		{ key: 'acts', label: 'Acciones', align: 'right' as const, card: 'aside' as const }
	];
</script>

<div class="layout">
	<section class="create">
		<h2>Invitar</h2>
		<form method="POST" action="?/crear" class="form" use:enhance={() => async ({ update }) => update({ reset: true })}>
			<label class="field">
				<span>Correo</span>
				<input class="input" type="email" name="email" required autocomplete="off" value={form?.create?.values.email ?? ''} />
			</label>
			<label class="field">
				<span>Nombre (opcional)</span>
				<input class="input" name="name" maxlength="120" autocomplete="off" value={form?.create?.values.name ?? ''} />
			</label>
			<label class="field">
				<span>Rol</span>
				<select class="input" name="role" required bind:value={role}>
					{#if data.roles.length > 1}<option value="" disabled>Elige un rol</option>{/if}
					{#each data.roles as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
				</select>
			</label>
			{#if data.brands.length && (role === 'brand' || role === '')}
				<fieldset class="field">
					<legend>Marcas</legend>
					{#each data.brands as b (b.code)}
						<label class="check"><input type="checkbox" name="brands" value={b.code} />{b.name}</label>
					{/each}
				</fieldset>
			{/if}
			{#if role === 'manager' || role === ''}
				<label class="field">
					<span>Restaurantes</span>
					<select class="input multi" name="restaurants" multiple size="6">
						{#each data.restaurants as r (r.id)}<option value={r.id}>{r.id} · {r.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if form?.create?.error}<p class="field-error" role="alert">{form.create.error}</p>{/if}
			<Button type="submit" variant="primary" icon={Send}>Enviar invitación</Button>
		</form>
	</section>

	<section class="pending">
		<h2>Pendientes</h2>
		{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
		{#if data.invitations.length}
			<DataTable caption="Invitaciones pendientes" {columns} rows={data.invitations} key={(r: Row) => r.id}>
				{#snippet cell(r: Row, col)}
					{#if col.key === 'who'}
						<b class="email">{r.email}</b>{#if r.name}<small>{r.name}</small>{/if}
					{:else if col.key === 'access'}
						{r.access}
					{:else if col.key === 'by'}
						{r.inviterName ?? '—'}
					{:else if col.key === 'sent'}
						<span class="num">{fmtDateTime(r.sentAt)}</span>
					{:else if col.key === 'expires'}
						{#if r.state === 'expired'}<Chip tone="amber">Caducada</Chip>{:else}<span class="num">{fmtDateTime(r.expiresAt)}</span>{/if}
					{:else if col.key === 'acts'}
						<span class="acts">
							<Button href="?confirmar=reenviar-{r.id}" variant="ghost" icon={RotateCcw} label="Reenviar" onclick={(e: MouseEvent) => open(e, `reenviar-${r.id}`)} />
							<Button href="?confirmar=revocar-{r.id}" variant="red" icon={Ban} label="Revocar" tipPos="left" onclick={(e: MouseEvent) => open(e, `revocar-${r.id}`)} />
						</span>
						<ConfirmDialog
							bind:this={dialogs[`reenviar-${r.id}`]}
							id="reenviar-{r.id}"
							title="¿Reenviar la invitación a {r.email}?"
							description="El enlace anterior deja de funcionar y la caducidad vuelve a 7 días."
							confirmLabel="Reenviar"
							action="?/reenviar"
							fields={{ id: r.id }}
							initiallyOpen={confirmar === `reenviar-${r.id}`}
						/>
						<ConfirmDialog
							bind:this={dialogs[`revocar-${r.id}`]}
							id="revocar-{r.id}"
							title="¿Revocar la invitación?"
							description="El enlace deja de funcionar. No se puede deshacer."
							confirmLabel="Revocar"
							tone="red"
							action="?/revocar"
							fields={{ id: r.id }}
							typeToConfirm={r.email}
							initiallyOpen={confirmar === `revocar-${r.id}`}
						/>
					{/if}
				{/snippet}
			</DataTable>
		{:else}
			<EmptyState icon={MailPlus} text="No hay invitaciones pendientes." />
		{/if}
	</section>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 48px;
		align-items: start;
	}
	section {
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.form {
		display: grid;
		gap: 16px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	legend {
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 6px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
	}
	.multi {
		height: auto;
		padding: 4px 0;
	}
	.multi option {
		padding: 4px 12px;
	}
	.email {
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	small {
		display: block;
		font-size: 12px;
		color: var(--muted);
	}
	.acts {
		display: inline-flex;
		gap: 4px;
	}
	@media (max-width: 1023px) {
		.layout {
			grid-template-columns: 1fr;
			gap: 32px;
		}
	}
</style>
