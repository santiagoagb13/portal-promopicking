<script lang="ts">
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Button from '$components/ui/Button.svelte';
	import EmptyState from '$components/ui/EmptyState.svelte';
</script>

<EmptyState icon={Megaphone} text="El alta de campañas llega en la fase 2.">
	<Button href="/campanas">Volver a campañas</Button>
</EmptyState>
