import type { MailMessage } from './index';

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

function layout(title: string, body: string, cta: { label: string; url: string }, foot: string) {
	return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;border-collapse:collapse">
<tr><td style="padding:0 0 16px;border-bottom:1px solid #e6e6e6;font-weight:600">Portal de servicio Promopicking</td></tr>
<tr><td style="padding:24px 0 8px;font-size:20px;font-weight:500">${esc(title)}</td></tr>
<tr><td style="padding:0 0 24px;color:#333">${body}</td></tr>
<tr><td style="padding:0 0 24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#111111;color:#ffffff;padding:10px 16px;text-decoration:none;font-weight:500">${esc(cta.label)}</a></td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid #e6e6e6;color:#6b6b6b;font-size:12px">${esc(foot)}</td></tr>
</table></body></html>`;
}

export function invitationMail(p: {
	to: string;
	inviter: string;
	roleLabel: string;
	url: string;
	expiresOn: string;
}): MailMessage {
	const title = `${p.inviter} te invita al portal`;
	const text = `${p.inviter} te invita al Portal de servicio Promopicking como ${p.roleLabel}.

Abre este enlace para crear tu acceso con una passkey (Face ID, Touch ID, Windows Hello o llave de seguridad):
${p.url}

La invitación caduca el ${p.expiresOn}. Si no esperabas este correo, ignóralo.`;
	return {
		to: p.to,
		subject: title,
		text,
		tag: 'invitation',
		html: layout(
			title,
			`Te invita como <b>${esc(p.roleLabel)}</b>. Crearás el acceso con una passkey: Face ID, Touch ID, Windows Hello o una llave de seguridad. Sin contraseñas.`,
			{ label: 'Aceptar la invitación', url: p.url },
			`Caduca el ${p.expiresOn}. Si no esperabas este correo, ignóralo.`
		)
	};
}

export function magicLinkMail(p: { to: string; url: string }): MailMessage {
	const title = 'Tu enlace de acceso';
	const text = `Abre este enlace para entrar en el Portal de servicio Promopicking:
${p.url}

Caduca en 10 minutos y solo sirve una vez. Si no lo has pedido, ignora este correo.`;
	return {
		to: p.to,
		subject: title,
		text,
		tag: 'magic-link',
		html: layout(
			title,
			'Pulsa el botón para entrar. Después podrás registrar una passkey en este dispositivo.',
			{ label: 'Entrar en el portal', url: p.url },
			'Caduca en 10 minutos y solo sirve una vez. Si no lo has pedido, ignora este correo.'
		)
	};
}
