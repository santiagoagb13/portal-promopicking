<script lang="ts">
	import MailCheck from '@lucide/svelte/icons/mail-check';

	let { data } = $props();
</script>

<MailCheck size={32} strokeWidth={1.25} />
<h1>Revisa tu correo</h1>
<p class="lead">
	Si hay una cuenta con ese correo{#if data.domain}&nbsp;de <b>{data.domain}</b>{/if}, te hemos enviado
	un enlace. Caduca en 10 minutos.
</p>
<a class="linkish" href="/acceso">Volver al acceso</a>
