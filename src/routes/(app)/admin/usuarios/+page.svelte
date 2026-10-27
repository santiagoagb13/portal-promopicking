<!-- Administración › Usuarios (5.4, 8.12). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Users from '@lucide/svelte/icons/users';
	import Button from '$components/ui/Button.svelte';
	import Chip from '$components/ui/Chip.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import Drawer from '$components/ui/Drawer.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import { closeOnSuccess } from '$components/ui/forms';
	import { ROLE_LABEL } from '$lib/i18n/es';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data, form: rawForm } = $props();
	const form = $derived(
		rawForm as { access?: { id?: string; error?: string }; user?: { error?: string } } | null
	);
	type Row = (typeof data.users)[number];

	let drawer: Drawer | undefined = $state();
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	// Se cambia al pulsar «Editar»; tras un envío fallido vuelve a la cuenta del formulario.
	let editingId = $derived<string | null>(form?.access?.id ?? data.editing);
	const editing = $derived(data.users.find((u) => u.id === editingId) ?? null);
	let role = $derived<string>(editing?.role ?? 'manager');
	const confirmar = $derived(page.url.searchParams.get('confirmar'));

	function edit(e: MouseEvent, u: Row) {
		e.preventDefault();
		editingId = u.id;
		drawer?.show();
	}
	function ask(e: MouseEvent, key: string) {
		e.preventDefault();
		dialogs[key]?.show();
	}

	const columns = [
		{ key: 'name', label: 'Usuario', card: 'title' as const },
		{ key: 'access', label: 'Rol y ámbito', card: 'subtitle' as const },
		{ key: 'seen', label: 'Último acceso' },
		{ key: 'status', label: 'Estado' },
		{ key: 'acts', label: 'Acciones', align: 'right' as const, card: 'aside' as const }
	];
</script>

<div class="page-h">
	<span class="muted">{data.users.length} cuentas</span>
	<Button href="/admin/invitaciones" variant="primary" icon={UserPlus}>Invitar</Button>
</div>
{#if form?.user?.error}<p class="field-error" role="alert">{form.user.error}</p>{/if}

{#if data.users.length}
	<DataTable caption="Usuarios" {columns} rows={data.users} key={(u: Row) => u.id} mobilePage={50}>
		{#snippet cell(u: Row, col)}
			{#if col.key === 'name'}
				<b class="n">{u.name}</b><small>{u.email}</small>
			{:else if col.key === 'access'}
				{u.access}
			{:else if col.key === 'seen'}
				<span class="num">{u.lastSeenAt ? fmtDateTime(u.lastSeenAt) : 'Nunca'}</span>
			{:else if col.key === 'status'}
				{#if u.status === 'active'}<Chip tone="green">Activa</Chip>{:else}<Chip tone="amber"
						>Suspendida</Chip
					>{/if}
				{#if u.self}<Chip tone="outline">Tú</Chip>{/if}
			{:else if col.key === 'acts' && !u.self}
				<span class="acts">
					<Button
						href="?editar={u.id}"
						variant="ghost"
						icon={Pencil}
						label="Editar rol y ámbito"
						onclick={(e: MouseEvent) => edit(e, u)}
					/>
					{#if u.status === 'active'}
						<Button
							href="?confirmar=suspender-{u.id}"
							variant="amber"
							icon={Pause}
							label="Suspender"
							onclick={(e: MouseEvent) => ask(e, `suspender-${u.id}`)}
						/>
					{:else}
						<Button
							href="?confirmar=reactivar-{u.id}"
							variant="green"
							icon={Play}
							label="Reactivar"
							onclick={(e: MouseEvent) => ask(e, `reactivar-${u.id}`)}
						/>
					{/if}
					<Button
						href="?confirmar=eliminar-{u.id}"
						variant="red"
						icon={Trash2}
						label="Eliminar"
						tipPos="left"
						onclick={(e: MouseEvent) => ask(e, `eliminar-${u.id}`)}
					/>
				</span>
				<ConfirmDialog
					bind:this={dialogs[`suspender-${u.id}`]}
					id="suspender-{u.id}"
					title="¿Suspender a {u.name}?"
					description="Se cierran sus sesiones al instante y no podrá entrar hasta que la reactives."
					confirmLabel="Suspender"
					tone="amber"
					action="?/suspender"
					fields={{ id: u.id }}
					initiallyOpen={confirmar === `suspender-${u.id}`}
				/>
				<ConfirmDialog
					bind:this={dialogs[`reactivar-${u.id}`]}
					id="reactivar-{u.id}"
					title="¿Reactivar a {u.name}?"
					confirmLabel="Reactivar"
					tone="green"
					action="?/reactivar"
					fields={{ id: u.id }}
					initiallyOpen={confirmar === `reactivar-${u.id}`}
				/>
				<ConfirmDialog
					bind:this={dialogs[`eliminar-${u.id}`]}
					id="eliminar-{u.id}"
					title="¿Eliminar la cuenta?"
					description="Se borran sus passkeys y sesiones y se anonimiza su nombre en la auditoría. No se puede deshacer."
					confirmLabel="Eliminar"
					tone="red"
					action="?/eliminar"
					fields={{ id: u.id }}
					typeToConfirm={u.name}
					initiallyOpen={confirmar === `eliminar-${u.id}`}
				/>
			{/if}
		{/snippet}
	</DataTable>
{:else}
	<EmptyState icon={Users} text="No hay cuentas que puedas gestionar." />
{/if}

<Drawer
	bind:this={drawer}
	id="acceso"
	title={editing ? `Acceso de ${editing.name}` : 'Acceso'}
	initiallyOpen={!!data.editing || !!form?.access}
	closeHref="?"
>
	{#if editing}
		{#key editing.id}
			<form
				method="POST"
				action="?/acceso"
				class="form"
				use:enhance={closeOnSuccess(() => drawer?.close())}
			>
				<input type="hidden" name="id" value={editing.id} />
				<label class="field">
					<span>Rol</span>
					<select class="input" name="role" bind:value={role}>
						{#each data.roles as r (r.value)}<option value={r.value}>{r.label}</option>{/each}
					</select>
				</label>
				{#if role === 'brand' && data.brands.length}
					<fieldset class="field">
						<legend>Marcas</legend>
						{#each data.brands as b (b.code)}
							<label class="check"
								><input
									type="checkbox"
									name="brands"
									value={b.code}
									checked={editing.scope.brands.includes(b.code)}
								/>{b.name}</label
							>
						{/each}
					</fieldset>
				{/if}
				{#if role === 'manager'}
					<label class="field">
						<span>Restaurantes</span>
						<select class="input multi" name="restaurants" multiple size="8">
							{#each data.restaurants as r (r.id)}<option
									value={r.id}
									selected={editing.scope.restaurants.includes(r.id)}>{r.id} · {r.name}</option
								>{/each}
						</select>
					</label>
				{/if}
				<p class="hint">
					Al guardar se cierran todas sus sesiones: el cambio rige en su próximo acceso.
				</p>
				{#if form?.access?.error}<p class="field-error" role="alert">{form.access.error}</p>{/if}
				<div class="actions">
					<Button type="button" onclick={() => drawer?.close()}>Cancelar</Button>
					<Button type="submit" variant="primary"
						>Guardar · {ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? ''}</Button
					>
				</div>
			</form>
		{/key}
	{/if}
</Drawer>

<style>
	.page-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 12px;
	}
	.muted,
	small,
	.hint {
		color: var(--muted);
		font-size: 12px;
	}
	small {
		display: block;
		overflow-wrap: anywhere;
	}
	.n {
		font-weight: 500;
	}
	.acts {
		display: inline-flex;
		gap: 2px;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
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
</style>
