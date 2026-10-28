<script lang="ts">
	import Button from '$components/ui/Button.svelte';

	let { data } = $props();
</script>

<form method="POST" action="/aprobaciones?/subir" enctype="multipart/form-data" class="form">
	<input type="hidden" name="soporte" value={data.support.id} />
	<label class="field">
		<span>PDF de las artes finales</span>
		<input type="file" name="ficheros" accept="application/pdf,.pdf" multiple required />
	</label>
	<p class="muted">
		El código de versión se lee del nombre: <code>FH-01_C2-RED+-SP_v2.pdf</code> → C2 RED+ SP. Hasta 50
		MB por fichero.
	</p>
	<div class="actions">
		<Button href="/aprobaciones?soporte={data.support.id}">Cancelar</Button>
		<Button type="submit" variant="primary">Subir y revisar</Button>
	</div>
</form>

<style>
	.form {
		max-width: 480px;
		display: grid;
		gap: 16px;
	}
	.muted {
		font-size: 13px;
		color: var(--muted);
		margin: 0;
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
</style>
