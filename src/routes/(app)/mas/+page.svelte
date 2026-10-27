<!-- «Más» de la barra inferior (8.2): el resto de destinos, la cuenta y salir. -->
<script lang="ts">
	import UserRound from '@lucide/svelte/icons/user-round';
	import Bell from '@lucide/svelte/icons/bell';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ThemeSwitch from '$components/shell/ThemeSwitch.svelte';
	import { NAV } from '$lib/nav';

	let { data } = $props();
	const items = $derived(NAV.filter((n) => data.more.includes(n.href)));
</script>

<ul class="list">
	{#each items as item (item.href)}
		<li><a href={item.href}><item.icon size={20} strokeWidth={1.5} aria-hidden={true} />{item.label}</a></li>
	{/each}
	<li><a href="/notificaciones"><Bell size={20} strokeWidth={1.5} aria-hidden="true" />Notificaciones{#if data.unread}<span class="count">{data.unread}</span>{/if}</a></li>
	<li><a href="/cuenta"><UserRound size={20} strokeWidth={1.5} aria-hidden="true" />Cuenta</a></li>
	<li class="row"><span>Tema</span><ThemeSwitch current={data.theme} /></li>
	<li>
		<form method="POST" action="/salir">
			<button type="submit"><LogOut size={20} strokeWidth={1.5} aria-hidden="true" />Salir</button>
		</form>
	</li>
</ul>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	li {
		border-bottom: 1px solid var(--line);
	}
	a,
	button,
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		width: 100%;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		padding: 0;
	}
	.row {
		justify-content: space-between;
	}
	.count {
		margin-left: auto;
		font-size: 11px;
		font-weight: 600;
		min-width: 18px;
		height: 18px;
		display: inline-grid;
		place-items: center;
		background: var(--amber);
		color: var(--on-amber);
		border-radius: 2px;
		padding: 0 5px;
	}
</style>
