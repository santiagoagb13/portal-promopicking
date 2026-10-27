<!--
	Subida de artes finales (8.5). Con JS los PDF van directos al almacenamiento con URL firmadas
	(no pasan por la función, que en Vercel limita el tamaño); sin JS, el formulario los envía.
	Después se revisan los códigos detectados antes de publicar.
-->
<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import Upload from '@lucide/svelte/icons/upload';
	import Button from '$components/ui/Button.svelte';
	import Drawer from '$components/ui/Drawer.svelte';
	import { fmtSize } from '$lib/domain/dates';

	let {
		supportId,
		supportName,
		initiallyOpen = false,
		error = null
	}: {
		supportId: string;
		supportName: string;
		initiallyOpen?: boolean;
		error?: string | null;
	} = $props();
	let drawer: Drawer | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let files = $state<File[]>([]);
	let progress = $state<Record<string, 'esperando' | 'subiendo' | 'hecho' | 'error'>>({});
	let busy = $state(false);
	let message = $state<string | null>(null);
	let over = $state(false);

	export function show() {
		drawer?.show();
	}

	function pick() {
		files = [...(input?.files ?? [])];
		progress = Object.fromEntries(files.map((f) => [f.name, 'esperando' as const]));
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		over = false;
		if (!e.dataTransfer?.files.length || !input) return;
		input.files = e.dataTransfer.files;
		pick();
	}

	async function action(name: string, body: FormData) {
		const res = await fetch(`?/${name}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text());
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!files.length) {
			message = 'Elige al menos un PDF';
			return;
		}
		busy = true;
		message = null;
		try {
			const prep = new FormData();
			prep.set('soporte', supportId);
			for (const f of files) {
				prep.append('nombre', f.name);
				prep.append('tamano', String(f.size));
			}
			const r = await action('prepararSubida', prep);
			if (r.type !== 'success') {
				message =
					(r.type === 'failure' && (r.data as { upload?: { error?: string } })?.upload?.error) ||
					'No se pudo empezar la subida';
				return;
			}
			const prepared = (
				r.data as {
					prepared: { uploadId: string; items: { id: string; name: string; url: string }[] };
				}
			).prepared;
			for (const [i, item] of prepared.items.entries()) {
				progress[item.name] = 'subiendo';
				const put = await fetch(item.url, {
					method: 'PUT',
					body: files[i],
					headers: { 'content-type': 'application/pdf' }
				});
				progress[item.name] = put.ok ? 'hecho' : 'error';
			}
			const reg = new FormData();
			reg.set('subida', prepared.uploadId);
			const done = await action('registrarSubida', reg);
			if (done.type === 'redirect') await goto(done.location);
			else message = 'No se pudieron comprobar los ficheros';
		} finally {
			busy = false;
		}
	}
</script>

<Drawer
	bind:this={drawer}
	id="subir"
	title="Subir artes · {supportName}"
	{initiallyOpen}
	closeHref="?soporte={supportId}"
>
	<form method="POST" action="?/subir" enctype="multipart/form-data" class="form" onsubmit={submit}>
		<input type="hidden" name="soporte" value={supportId} />
		<label
			class="drop"
			class:over
			ondragover={(e) => {
				e.preventDefault();
				over = true;
			}}
			ondragleave={() => (over = false)}
			ondrop={drop}
		>
			<Upload size={24} strokeWidth={1.5} aria-hidden="true" />
			<span>Arrastra los PDF o elígelos</span>
			<small
				>El código de versión se lee del nombre: <code>FH-01_C2-RED+-SP_v2.pdf</code> → C2 RED+ SP. Hasta
				50 MB por fichero.</small
			>
			<input
				bind:this={input}
				class="sr-only"
				type="file"
				name="ficheros"
				accept="application/pdf,.pdf"
				multiple
				onchange={pick}
			/>
		</label>
		{#if files.length}
			<ul class="files">
				{#each files as f (f.name)}
					<li>
						<span class="mono">{f.name}</span><span class="num">{fmtSize(f.size)}</span><span
							class="st {progress[f.name]}">{progress[f.name]}</span
						>
					</li>
				{/each}
			</ul>
		{/if}
		{#if message || error}<p class="field-error" role="alert">{message ?? error}</p>{/if}
		<div class="actions">
			<Button type="button" onclick={() => drawer?.close()}>Cancelar</Button>
			<Button type="submit" variant="primary" icon={Upload} disabled={busy}
				>{busy ? 'Subiendo…' : 'Subir y revisar'}</Button
			>
		</div>
	</form>
</Drawer>

<style>
	.drop {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 32px 16px;
		border: 1px dashed var(--line);
		text-align: center;
		cursor: pointer;
		color: var(--muted);
	}
	.drop span {
		color: var(--ink);
		font-weight: 500;
	}
	.drop.over,
	.drop:hover {
		border-color: var(--ink);
	}
	.drop:focus-within {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	small {
		font-size: 12px;
	}
	code,
	.mono {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.files {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	.files li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line-soft);
		font-size: 13px;
	}
	.files .mono {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.st {
		font-size: 12px;
		color: var(--muted);
	}
	.st.hecho {
		color: var(--green);
	}
	.st.error {
		color: var(--red);
	}
</style>
