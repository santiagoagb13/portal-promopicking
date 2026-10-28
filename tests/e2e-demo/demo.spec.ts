import { expect, test } from '@playwright/test';

test.describe('Modo pruebas · se ve todo sin login', () => {
	test('quien llega sin sesión entra como Jorge, con el aviso visible y sin indexar', async ({
		page
	}) => {
		const res = await page.goto('/');
		expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
		await expect(page).toHaveURL(/\/campanas$/);
		const banner = page.getByRole('form', { name: 'Modo pruebas' });
		await expect(banner).toContainText('Datos ficticios y sin contraseña');
		await expect(banner.getByLabel('Ver como')).toHaveValue('u-jorge-martin');
		await expect(page.getByRole('button', { name: 'Cuenta de Jorge Martín' })).toBeVisible();
	});

	test('la pantalla de acceso lleva directamente al portal', async ({ page }) => {
		await page.goto('/acceso');
		await expect(page).toHaveURL(/\/campanas$/);
	});

	test('«Ver como» cambia de perfil y se queda en la misma pantalla', async ({ page }) => {
		await page.goto('/soporte');
		await page.getByLabel('Ver como').selectOption('u-ana-soler');
		await expect(page.getByRole('button', { name: 'Cuenta de Ana Soler' })).toBeVisible();
		await expect(page).toHaveURL(/\/soporte$/);
		await expect(page.getByRole('link', { name: 'Recepción' }).first()).toBeVisible();
		// El perfil elegido se mantiene al navegar.
		await page.goto('/reposiciones');
		await expect(page.getByLabel('Ver como')).toHaveValue('u-ana-soler');
		await page.getByLabel('Ver como').selectOption('u-marta-ruiz');
		await expect(page.getByRole('button', { name: 'Cuenta de Marta Ruiz' })).toBeVisible();
	});

	test('las artes del seed se sirven desde la base de datos', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('Ver como').selectOption('u-marta-ruiz');
		await page.goto('/aprobaciones?soporte=fh-cs');
		const img = page.locator('.stage img').first();
		await expect(img).toBeVisible();
		await expect
			.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth))
			.toBeGreaterThan(0);
		expect(await img.getAttribute('src')).toMatch(/^\/archivos\//);
	});

	test('el punto de entrada sin login no existe como URL', async ({ request }) => {
		const res = await request.post('/api/auth/modo-pruebas/entrar', {
			data: { userId: 'u-jorge-martin' }
		});
		expect(res.status()).toBe(404);
	});
});
