<!-- Sidebar (8.2; 7.5, regla 4): 72 px con etiqueta corta bajo el icono; 232 px desde 1280 px. -->
<script lang="ts">
	import { page } from '$app/state';
	import { isActive, type NavItem } from '$lib/nav';

	type Props = {
		items: NavItem[];
		counts: { pending: number; incidents: number };
		user: { name: string; initials: string; subtitle: string };
	};
	let { items, counts, user }: Props = $props();
</script>

<aside class="sb" aria-label="Navegación principal">
	<a class="sb-logo" href="/campanas" aria-label="Portal Promopicking · Campañas">
		<span class="logo-mark" aria-hidden="true">P</span><b class="sb-label">Promopicking</b>
	</a>
	<nav>
		{#each items as item (item.href)}
			{@const active = isActive(item.href, page.url.pathname)}
			{@const n = item.count ? counts[item.count] : 0}
			<a
				href={item.href}
				class:active
				aria-current={active ? 'page' : undefined}
				title={item.label}
			>
				<item.icon size={20} strokeWidth={1.5} aria-hidden={true} />
				<span class="sb-label">{item.label}</span>
				<span class="sb-short">{item.short}</span>
				{#if n}<span class="count" class:warn={item.count === 'pending'} aria-label="{n} pendientes"
						>{n}</span
					>{/if}
			</a>
		{/each}
	</nav>
	<a class="sb-foot" href="/cuenta" title="Cuenta">
		<span class="avatar" aria-hidden="true">{user.initials}</span>
		<span class="sb-label">{user.name}<small>{user.subtitle}</small></span>
	</a>
</aside>

<style>
	.sb {
		position: fixed;
		inset: 0 auto 0 0;
		width: var(--sbw);
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--muted);
		border-right: 1px solid var(--line);
		z-index: 30;
		overflow: hidden;
	}
	.sb-logo {
		height: var(--top);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 18px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		flex: none;
	}
	.sb-logo b {
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
		letter-spacing: -0.01em;
	}
	.logo-mark {
		width: 20px;
		height: 20px;
		flex: none;
		background: var(--ink);
		color: var(--bg);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 12px;
	}
	nav {
		padding: 8px 0;
		flex: 1;
		overflow-y: auto;
	}
	nav a {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		height: 40px;
		padding: 0 18px;
		white-space: nowrap;
		transition:
			color var(--t),
			background var(--t);
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a.active {
		color: var(--ink);
		background: var(--line-soft);
	}
	.sb-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sb-short {
		display: none;
	}
	.count {
		margin-left: auto;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		display: inline-grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		background: var(--line-soft);
		color: var(--ink);
		border-radius: 2px;
		line-height: 1;
	}
	.count.warn {
		background: var(--amber);
		color: var(--on-amber);
	}
	.sb-foot {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px;
		border-top: 1px solid var(--line);
		white-space: nowrap;
		font-size: 13px;
		color: var(--ink);
	}
	.sb-foot small {
		display: block;
		font-size: 12px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.avatar {
		width: 28px;
		height: 28px;
		flex: none;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 600;
		background: var(--primary);
		color: var(--on-primary);
	}
	@media (max-width: 1279px) {
		.sb-logo {
			justify-content: center;
			padding: 0;
		}
		.sb-logo .sb-label,
		.sb-foot .sb-label,
		nav a .sb-label {
			display: none;
		}
		nav a {
			flex-direction: column;
			justify-content: center;
			gap: 4px;
			height: 56px;
			padding: 0;
			font-size: 11px;
			line-height: 1.15;
		}
		nav a .sb-short {
			display: block;
			max-width: 72px;
			letter-spacing: -0.01em;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.count {
			position: absolute;
			top: 4px;
			left: calc(50% + 2px);
			transform: scale(0.85);
			margin: 0;
		}
		.sb-foot {
			justify-content: center;
			padding: 12px 0;
		}
	}
	@media (max-width: 767px) {
		.sb {
			display: none;
		}
	}
</style>
