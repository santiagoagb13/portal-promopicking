<!--
	Aviso legal y de privacidad (fase 7; RGPD en 4.3 del plan). Los datos del titular salen de
	Administración › Ajustes; mientras no estén puestos, se muestran como pendientes.
-->
<script lang="ts">
	let { data } = $props();
	const c = $derived(data.company);
	const pending = 'pendiente de completar en Ajustes';
</script>

<article>
	<h1>Aviso legal y privacidad</h1>

	<h2>Titular</h2>
	<dl>
		<dt>Razón social</dt>
		<dd>{c.name || pending}</dd>
		<dt>NIF</dt>
		<dd>{c.taxId || pending}</dd>
		<dt>Domicilio</dt>
		<dd>{c.address || pending}</dd>
		<dt>Contacto de privacidad</dt>
		<dd>
			{#if c.email}<a href="mailto:{c.email}">{c.email}</a>{:else}{pending}{/if}
		</dd>
	</dl>

	<h2>Para qué es este portal</h2>
	<p>
		Es la herramienta de trabajo entre Promopicking, Alsea (Foster's Hollywood, VIPS y Ginos), la
		imprenta y los restaurantes para gestionar las campañas de material impreso: aprobación de artes
		finales, kits, reposiciones, soporte e informes. Solo entra quien recibe una invitación.
	</p>

	<h2>Datos personales</h2>
	<ul>
		<li>
			<b>Qué datos</b>: nombre, correo, organización, perfil y ámbito (marcas o restaurantes), las
			passkeys registradas (solo la clave pública, nunca la huella ni la cara) y el registro de lo
			que se hace en el portal (fecha, IP y navegador) para la auditoría.
		</li>
		<li>
			<b>Para qué</b>: dar acceso y permisos, avisar por correo y en la campana de lo que toca a
			cada persona, y dejar constancia de aprobaciones, recepciones y pedidos.
		</li>
		<li>
			<b>Base legal</b>: la ejecución del contrato de servicio entre Promopicking y Alsea y el
			interés legítimo en poder demostrar quién aprobó o recibió cada cosa.
		</li>
		<li>
			<b>Cuánto tiempo</b>: mientras la cuenta esté activa. Al eliminar una cuenta se borran sus
			datos y la auditoría se conserva anonimizada.
		</li>
		<li>
			<b>Con quién se comparten</b>: con nadie fuera del servicio. El alojamiento, la base de datos,
			los ficheros y el envío de correos los prestan proveedores que actúan como encargados del
			tratamiento, con servidores en la Unión Europea.
		</li>
		<li>
			<b>Tus derechos</b>: acceso, rectificación, supresión, oposición, limitación y portabilidad,
			escribiendo al contacto de privacidad. También puedes reclamar ante la Agencia Española de
			Protección de Datos (aepd.es).
		</li>
	</ul>

	<h2>Cookies</h2>
	<p>
		Solo cookies técnicas, imprescindibles para que el portal funcione: la sesión, el tema claro u
		oscuro y el dominio con el que entraste. No hay cookies de analítica ni de publicidad, por eso
		no se pide consentimiento.
	</p>

	<p class="back"><a href="/campanas">Volver al portal</a></p>
</article>

<style>
	article {
		padding-bottom: 32px;
		font-size: 15px;
		line-height: 1.55;
	}
	h1 {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 24px;
	}
	h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 28px 0 8px;
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 4px 16px;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
	}
	ul {
		padding-left: 20px;
		display: grid;
		gap: 8px;
	}
	b {
		font-weight: 500;
	}
	.back {
		margin-top: 32px;
	}
	@media (max-width: 479px) {
		dl {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
