import { expect, test } from '@playwright/test';
import { addVirtualAuthenticator, lastMail, linkIn } from './helpers';

const INVITED = 'gerente.granvia48@fosters.example';

test('invitación → passkey → panel con el ámbito del gerente → salir → entrar con passkey', async ({
	page
}) => {
	const { client, authenticatorId } = await addVirtualAuthenticator(page);

	// 1 · El enlace del correo de invitación (el token en claro solo existe ahí).
	const mail = await lastMail(INVITED, 'invitation');
	expect(mail.subject).toBe('Jorge Martín te invita al portal');
	await page.goto(linkIn(mail));
	await expect(
		page.getByRole('heading', { name: 'Jorge Martín te invita como Gerente · FH Gran Vía 48' })
	).toBeVisible();
	await expect(page.getByLabel('Correo')).toHaveValue(INVITED);

	// 2 · Confirma el nombre y crea la passkey: se crea la cuenta y se abre sesión.
	await page.getByLabel('Tu nombre').fill('Pablo Gil Ortega');
	await page.getByRole('button', { name: 'Crear passkey' }).click();
	await expect(page).toHaveURL(/\/campanas$/);
	const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId });
	expect(credentials).toHaveLength(1);

	// 3 · Panel limitado a su ámbito: campañas de Foster's (su restaurante), sin filtro de marcas.
	await expect(page.getByRole('heading', { level: 1, name: 'Campañas' })).toBeVisible();
	const table = page.getByRole('table', { name: 'Campañas' });
	// 7 campañas de Foster's + la fila de cabecera.
	await expect(table.getByRole('row')).toHaveCount(7 + 1);
	await expect(table).toContainText('Halloween FH');
	await expect(table).not.toContainText('VIPS');
	await expect(table).not.toContainText('Ginos');
	await expect(page.getByRole('navigation', { name: 'Filtrar por marca' })).toHaveCount(0);
	const nav = page.getByRole('complementary', { name: 'Navegación principal' });
	await expect(nav.getByRole('link', { name: 'Recepción de kits' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Aprobación de artes' })).toHaveCount(0);
	await expect(nav.getByRole('link', { name: 'Administración' })).toHaveCount(0);

	// 4 · Fuera del ámbito: otra marca es «no encontrada» y Administración, 403.
	expect((await page.goto('/campanas/VI-26-03'))?.status()).toBe(404);
	expect((await page.goto('/admin/invitaciones'))?.status()).toBe(403);
	expect((await page.goto('/campanas?marca=VIPS'))?.status()).toBe(200);
	await expect(page.getByRole('table', { name: 'Campañas' })).not.toContainText('VIPS');

	// 5 · La invitación ya no sirve. Sin presencia simulada, el autocompletado de passkeys
	// del campo de correo no entra solo mientras se comprueba.
	await client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
	await page.getByRole('button', { name: 'Cuenta de Pablo Gil Ortega' }).click();
	await page.getByRole('button', { name: 'Salir' }).click();
	await expect(page).toHaveURL(/\/acceso$/);
	await page.goto(linkIn(mail));
	await expect(page.getByRole('heading', { name: 'Esta invitación ya se usó' })).toBeVisible();

	// 6 · Vuelve a entrar con la passkey creada (botón o autocompletado condicional, lo que llegue antes).
	await page.goto('/acceso');
	const button = page.getByRole('button', { name: 'Entrar con passkey' });
	await expect(button).toBeVisible();
	await client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
	await button.click({ timeout: 3000 }).catch(() => {});
	await expect(page).toHaveURL(/\/campanas$/);
	await page.goto('/cuenta');
	// La passkey lleva el nombre del dispositivo y su último uso.
	const passkey = page.getByRole('listitem').filter({ hasText: 'último uso' });
	await expect(passkey).toHaveCount(1);
	await expect(passkey).toContainText(/(Windows|Mac|Linux) · Chrome/);
});

test('un enlace de invitación inventado no revela nada', async ({ page }) => {
	await page.goto('/invitacion/' + 'A'.repeat(43));
	await expect(page.getByRole('heading', { name: 'Este enlace no es válido' })).toBeVisible();
});
