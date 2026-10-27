<!-- Barra superior (8.2): título, buscador (⌘K), campana y menú de cuenta con avatar cuadrado. -->
<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import UserRound from '@lucide/svelte/icons/user-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import type { Theme } from '$lib/schemas/auth';
	import ThemeSwitch from './ThemeSwitch.svelte';

	type Props = {
		title: string;
		unread: number;
		theme: Theme;
		user: { name: string; email: string; initials: string; subtitle: string };
	};
	let { title, unread, theme, user }: Props = $props();
	let search: HTMLInputElement | undefined = $state();

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			search?.focus();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<header class="topbar">
	<h1>{title}</h1>
	<form class="search" role="search" action="/campanas" method="GET">
		<Search size={16} strokeWidth={1.5} aria-hidden="true" />
		<label class="sr-only" for="buscar">Buscar</label>
		<input id="buscar" bind:this={search} name="q" type="search" placeholder="Buscar" autocomplete="off" />
		<kbd aria-hidden="true">⌘K</kbd>
	</form>
	<a
		class="icon"
		href="/notificaciones"
		aria-label={unread ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
		data-tip="Notificaciones"
	>
		<Bell size={20} strokeWidth={1.5} aria-hidden="true" />
		{#if unread}<span class="pip" aria-hidden="true"></span>{/if}
	</a>
	<button class="avatar" type="button" popovertarget="menu-cuenta" aria-label="Cuenta de {user.name}"
		>{user.initials}</button
	>
	<div id="menu-cuenta" class="menu" popover>
		<div class="who">
			<b>{user.name}</b>
			<small>{user.email}</small>
			<small>{user.subtitle}</small>
		</div>
		<a href="/cuenta" class="item"><UserRound size={16} strokeWidth={1.5} aria-hidden="true" />Cuenta</a>
		<div class="item theme"><span>Tema</span><ThemeSwitch current={theme} /></div>
		<form method="POST" action="/salir">
			<button type="submit" class="item"><LogOut size={16} strokeWidth={1.5} aria-hidden="true" />Salir</button>
		</form>
	</div>
</header>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		height: var(--top);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 24px;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	h1 {
		margin-right: auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.search {
		height: 32px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: var(--surface);
		color: var(--muted);
		width: 240px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		color: var(--ink);
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	kbd {
		font-size: 11px;
		border: 1px solid var(--line);
		padding: 1px 4px;
		border-radius: 2px;
	}
	.icon {
		position: relative;
		width: 36px;
		height: 36px;
		display: inline-grid;
		place-items: center;
		border-radius: 2px;
		transition: background var(--t);
	}
	.icon:hover {
		background: var(--line-soft);
	}
	.pip {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--amber);
	}
	.avatar {
		width: 28px;
		height: 28px;
		flex: none;
		display: grid;
		place-items: center;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		background: var(--primary);
		color: var(--on-primary);
		border: 0;
		margin-left: 4px;
	}
	.menu {
		inset: auto;
		top: calc(var(--top) - 4px);
		right: 16px;
		margin: 0;
		width: 264px;
		padding: 4px 0;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
	}
	.who {
		padding: 10px 16px 12px;
		border-bottom: 1px solid var(--line);
		display: grid;
		gap: 2px;
	}
	.who b {
		font-weight: 500;
	}
	.who small {
		font-size: 12px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item {
		width: 100%;
		min-height: 40px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 16px;
		border: 0;
		background: transparent;
		font: inherit;
		text-align: left;
	}
	a.item:hover,
	button.item:hover {
		background: var(--line-soft);
	}
	.item.theme {
		justify-content: space-between;
		border-top: 1px solid var(--line-soft);
		border-bottom: 1px solid var(--line-soft);
		padding-top: 6px;
		padding-bottom: 6px;
	}
	@media (max-width: 1023px) {
		.search {
			width: 36px;
			padding: 0;
			justify-content: center;
			border-color: transparent;
		}
		.search input,
		.search kbd {
			display: none;
		}
	}
	@media (max-width: 767px) {
		.topbar {
			padding: 0 16px;
		}
		.search {
			display: none;
		}
		.icon {
			width: 44px;
			height: 44px;
		}
		.avatar {
			width: 32px;
			height: 32px;
		}
		.menu {
			right: 8px;
			width: min(300px, calc(100vw - 16px));
		}
	}
</style>
