import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { OUTBOX } from '../../playwright.config';

type Mail = { to: string; subject: string; text: string; tag?: string };

/** Último correo de la bandeja de pruebas para `to` (y etiqueta), esperando hasta que llegue. */
export async function lastMail(to: string, tag?: string): Promise<Mail> {
	let found: Mail | undefined;
	await expect
		.poll(() => {
			try {
				const mails = readFileSync(OUTBOX, 'utf8')
					.trim()
					.split('\n')
					.map((l) => JSON.parse(l) as Mail)
					.filter((m) => m.to === to && (!tag || m.tag === tag));
				found = mails.at(-1);
			} catch {
				found = undefined;
			}
			return !!found;
		})
		.toBe(true);
	return found!;
}

export function linkIn(mail: Mail): string {
	const url = mail.text.match(/https?:\/\/\S+/)?.[0];
	if (!url) throw new Error('El correo no lleva enlace');
	return url;
}

/** Autenticador virtual de Chromium (WebAuthn por CDP): passkeys sin hardware. */
export async function addVirtualAuthenticator(page: Page) {
	const client = await page.context().newCDPSession(page);
	await client.send('WebAuthn.enable');
	const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return { client, authenticatorId };
}

/** Entra con enlace mágico (para las pruebas que no van de passkeys). */
export async function signInWithMagicLink(page: Page, email: string) {
	await page.goto('/acceso');
	await page.getByLabel('Correo').fill(email);
	await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
	await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
	await page.goto(linkIn(await lastMail(email, 'magic-link')));
	await expect(page).toHaveURL(/\/bienvenida/);
	await page.getByRole('link', { name: 'Ahora no' }).click();
	await expect(page).toHaveURL(/\/campanas$/);
}

export async function horizontalOverflow(page: Page): Promise<number> {
	return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
