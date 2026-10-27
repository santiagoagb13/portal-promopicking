<!-- QR de versión (8.7): códigos por versión aprobada y restaurante, para la imprenta. -->
<script lang="ts">
	import { page } from '$app/state';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Printer from '@lucide/svelte/icons/printer';
	import Button from '$components/ui/Button.svelte';
	import ConfirmDialog from '$components/ui/ConfirmDialog.svelte';
	import DataTable from '$components/ui/DataTable.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';

	let { data, form } = $props();
	type Row = (typeof data.supports)[number];
	let dialogs: Record<string, ConfirmDialog | undefined> = $state({});
	const confirmar = $derived(page.url.searchParams.get('confirmar'));
	const columns = [
		{ key: 'name', label: 'Soporte', card: 'title' as const },
		{ key: 'campaign', label: 'Campaña', card: 'subtitle' as const },
		{ key: 'approved', label: 'Versiones aprobadas', align: 'right' as const },
		{ key: 'codes', label: 'Códigos', align: 'right' as const },
		{ key: 'acts', label: 'Acciones', align: 'right' as const, card: 'aside' as const }
	];
</script>

{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
{#if data.supports.length}
	<DataTable caption="Soportes con QR" {columns} rows={data.supports} key={(r: Row) => r.id}>
		{#snippet cell(r: Row, col)}
			{#if col.key === 'name'}<b>{r.name}</b>
			{:else if col.key === 'campaign'}<small
					>{r.campaignName} · <span class="mono">{r.campaignId}</span></small
				>
			{:else if col.key === 'approved'}<span class="num">{r.approved}</span>
			{:else if col.key === 'codes'}<span class="num">{r.codes}</span>
			{:else if col.key === 'acts'}
				<span class="acts">
					{#if data.canGenerate}
						<Button
							href="?confirmar={r.id}"
							variant="primary"
							icon={QrCode}
							label="Generar los QR que falten"
							onclick={(e: MouseEvent) => {
								e.preventDefault();
								dialogs[r.id]?.show();
							}}
						/>
						<ConfirmDialog
							bind:this={dialogs[r.id]}
							id="gen-{r.id}"
							title="¿Generar los QR de {r.name}?"
							description="Un código por versión aprobada y restaurante; los que ya existen no cambian."
							confirmLabel="Generar"
							action="?/generar"
							fields={{ soporte: r.id }}
							initiallyOpen={confirmar === r.id}
						/>
					{/if}
					{#if r.codes}<Button
							href="/qr/soporte/{r.id}"
							variant="ghost"
							icon={Printer}
							label="Hoja de códigos para la imprenta"
							tipPos="left"
						/>{/if}
				</span>
			{/if}
		{/snippet}
	</DataTable>
{:else}
	<EmptyState icon={QrCode} text="Los QR se generan cuando un soporte tiene versiones aprobadas." />
{/if}

<style>
	b {
		font-weight: 500;
	}
	small {
		color: var(--muted);
		font-size: 12px;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.acts {
		display: inline-flex;
		gap: 4px;
	}
</style>
