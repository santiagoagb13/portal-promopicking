<!--
	Aviso del modo pruebas (ADR 0013): siempre visible, dice que se entra sin contraseña y deja
	cambiar de perfil. Es un formulario normal: funciona sin JS (con JS cambia al elegir).
-->
<script lang="ts">
	import { page } from '$app/state';

	let {
		profiles,
		current
	}: { profiles: readonly { id: string; name: string; label: string }[]; current: string } =
		$props();
</script>

<form method="POST" action="/modo-pruebas" class="demo" aria-label="Modo pruebas">
	<input type="hidden" name="volver" value={page.url.pathname + page.url.search} />
	<b>Modo pruebas</b>
	<span class="txt">Datos ficticios y sin contraseña.</span>
	<label>
		<span>Ver como</span>
		<select name="perfil" class="input" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
			{#each profiles as p (p.id)}
				<option value={p.id} selected={p.id === current}>{p.name} · {p.label}</option>
			{/each}
		</select>
	</label>
	<noscript><button type="submit">Cambiar</button></noscript>
</form>

<style>
	.demo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		padding: 8px 24px;
		background: var(--amber-bg);
		color: var(--amber-ink);
		font-size: 13px;
		border-bottom: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
	}
	b {
		font-weight: 600;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}
	select {
		height: 32px;
		width: auto;
		max-width: 100%;
		font-size: 13px;
		padding: 0 8px;
	}
	@media (max-width: 767px) {
		.demo {
			padding: 8px 16px;
		}
		.txt {
			display: none;
		}
		label {
			margin-left: 0;
			flex: 1;
			min-width: 0;
		}
		select {
			flex: 1;
			min-width: 0;
		}
	}
</style>
