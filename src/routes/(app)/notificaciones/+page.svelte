<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Bell from '@lucide/svelte/icons/bell';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import Button from '$components/ui/Button.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
	import { useToaster } from '$components/ui/toast.svelte';
	import { fmtDateTime } from '$lib/domain/dates';

	let { data } = $props();
	const toaster = useToaster();
	const unread = $derived(data.items.filter((n) => !n.readAt).length);

	async function undo(read: string[]) {
		const body = new FormData();
		for (const id of read) body.append('id', id);
		const res = await fetch('?/noLeer', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		deserialize(await res.text());
		await invalidateAll();
	}
</script>

{#if data.items.length}
	<div class="bar">
		<span class="muted">{unread} sin leer</span>
		{#if unread}
			<form
				method="POST"
				action="?/leer"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							const read = (result.data?.read as string[]) ?? [];
							toaster.show('Todas leídas', { tone: 'green', undo: () => undo(read) });
						}
					}}
			>
				<Button type="submit" variant="green" icon={CheckCheck} label="Marcar todas como leídas" tipPos="left" />
			</form>
		{/if}
	</div>
	<ul class="list">
		{#each data.items as n (n.id)}
			<li class:unread={!n.readAt}>
				<a href={n.href ?? '/campanas'}>
					<span class="dot" aria-hidden="true"></span>
					<span class="t">{n.title}</span>
					<time class="num">{fmtDateTime(n.createdAt)}</time>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<EmptyState icon={Bell} text="No tienes notificaciones." />
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 12px;
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--line);
	}
	li {
		border-bottom: 1px solid var(--line-soft);
	}
	a {
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		min-height: 48px;
	}
	a:hover {
		background: var(--line-soft);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.unread .dot {
		background: var(--amber);
	}
	.unread .t {
		font-weight: 500;
	}
	time {
		font-size: 12px;
		color: var(--muted);
	}
	@media (max-width: 479px) {
		a {
			grid-template-columns: 10px minmax(0, 1fr);
			padding: 8px 0;
		}
		time {
			grid-column: 2;
		}
	}
</style>
