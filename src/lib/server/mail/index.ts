import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config, serverEnv } from '../config';

export type MailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	/** Etiqueta interna para localizar el correo en la bandeja de desarrollo (invitation, magic-link…). */
	tag?: string;
};

export interface MailTransport {
	send(message: MailMessage): Promise<void>;
}

/** Desarrollo y pruebas: escribe el correo en consola y lo añade a `.mail/outbox.jsonl`. */
export const devTransport: MailTransport = {
	async send(message) {
		const dir = config.mailOutboxDir;
		await mkdir(dir, { recursive: true });
		const entry = { at: new Date().toISOString(), from: config.mailFrom, ...message };
		await appendFile(join(dir, 'outbox.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
		console.info(
			`\n[correo] Para: ${message.to}\n[correo] Asunto: ${message.subject}\n${message.text}\n`
		);
	}
};

/** Modo pruebas: solo una línea en el registro, sin enlaces (nadie entra por correo en la demo). */
export const consoleTransport: MailTransport = {
	async send(message) {
		console.info(`[correo · modo pruebas] Para: ${message.to} · ${message.subject}`);
	}
};

/** Resend por su API HTTP (sin SDK). Requiere RESEND_API_KEY y un MAIL_FROM de un dominio verificado. */
export const resendTransport: MailTransport = {
	async send(message) {
		const key = serverEnv('RESEND_API_KEY');
		if (!key) throw new Error('MAIL_PROVIDER=resend sin RESEND_API_KEY');
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				from: config.mailFrom,
				to: [message.to],
				subject: message.subject,
				text: message.text,
				html: message.html,
				tags: message.tag ? [{ name: 'tipo', value: message.tag }] : undefined
			})
		});
		if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
	}
};

/** SMTP propio (VPS). Se carga nodemailer solo si se elige este proveedor; hay que instalarlo entonces. */
export const smtpTransport: MailTransport = {
	async send(message) {
		const moduleName = 'nodemailer';
		const nodemailer = (await import(/* @vite-ignore */ moduleName).catch(() => {
			throw new Error('MAIL_PROVIDER=smtp requiere instalar nodemailer (npm i nodemailer)');
		})) as {
			createTransport(o: object): { sendMail(m: object): Promise<unknown> };
		};
		const transport = nodemailer.createTransport({
			host: serverEnv('SMTP_HOST'),
			port: Number(serverEnv('SMTP_PORT') ?? 587),
			secure: serverEnv('SMTP_SECURE') === 'true',
			auth: { user: serverEnv('SMTP_USER'), pass: serverEnv('SMTP_PASS') }
		});
		await transport.sendMail({ from: config.mailFrom, ...message });
	}
};

export function mailTransport(): MailTransport {
	switch (config.mailProvider) {
		case 'resend':
			return resendTransport;
		case 'smtp':
			return smtpTransport;
		default:
			// Modo pruebas sin proveedor: los correos solo se registran (no hay disco en Vercel).
			if (config.demo) return consoleTransport;
			// En producción nunca se escriben enlaces de acceso en los registros: sin proveedor, falla.
			if (config.production) throw new Error('Falta MAIL_PROVIDER (resend o smtp) en producción');
			return devTransport;
	}
}

export async function sendMail(message: MailMessage): Promise<void> {
	await mailTransport().send(message);
}
