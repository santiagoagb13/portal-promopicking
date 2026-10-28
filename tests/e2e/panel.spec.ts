import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { stateOf } from './users';
import { horizontalOverflow } from './helpers';

const WIDTHS = [375, 768, 1024, 1440] as const;
const HEIGHT: Record<(typeof WIDTHS)[number], number> = {
	375: 812,
	768: 1024,
	1024: 768,
	1440: 900
};
const DIR = 'tests/e2e/capturas';

test.describe('Panel de campañas', () => {
	test.use({ storageState: stateOf('jorge') });
	test.beforeEach(async ({ page }) => {
		await page.goto('/campanas');
	});

	test('KPI, filtro por marca en la URL y orden por semáforo', async ({ page }) => {
		const kpis = page.getByRole('region', { name: 'Indicadores' });
		await expect(kpis).toContainText(/Campañas activas\s*11\s*de 17 en el calendario/);
		await expect(kpis).toContainText(/Versiones pendientes\s*13/);
		await expect(kpis).toContainText(/Incidencias abiertas\s*1/);
		await expect(kpis).toContainText(/Próxima entrega\s*26\/10\s*Halloween FH · en 4 días/);

		await page
			.getByRole('navigation', { name: 'Filtrar por marca' })
			.getByRole('link', { name: 'VIPS' })
			.click();
		await expect(page).toHaveURL(/\?marca=VIPS$/);
		const table = page.getByRole('table', { name: 'Campañas' });
		// 5 campañas de VIPS + la fila de cabecera.
		await expect(table.getByRole('row')).toHaveCount(5 + 1);
		await expect(table).not.toContainText('Halloween FH');

		await page.goto('/campanas?orden=semaforo');
		const first = table.getByRole('row').nth(1);
		await expect(first).toContainText('Encartes noche VIPS');
		await expect(first.getByRole('img', { name: 'Incidencia abierta' })).toBeVisible();
	});

	test('sin scroll horizontal de 375 a 1440 px, claro y oscuro, con capturas', async ({ page }) => {
		mkdirSync(DIR, { recursive: true });
		for (const scheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			for (const width of WIDTHS) {
				await page.setViewportSize({ width, height: HEIGHT[width] });
				await page.goto('/campanas');
				await expect(page.getByRole('region', { name: 'Indicadores' })).toBeVisible();
				expect(await horizontalOverflow(page), `${width} px ${scheme}`).toBeLessThanOrEqual(0);
				const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
				expect(bg).toBe(scheme === 'dark' ? 'rgb(12, 12, 12)' : 'rgb(255, 255, 255)');
				await page.screenshot({
					path: `${DIR}/panel-${width}-${scheme === 'dark' ? 'oscuro' : 'claro'}.png`,
					fullPage: true
				});
			}
		}
	});

	test('móvil: 8 fichas, «Ver más» y barra inferior por rol', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/campanas');
		const rows = page.getByRole('table', { name: 'Campañas' }).locator('tbody tr');
		await expect(rows.filter({ visible: true })).toHaveCount(8);
		await page.getByRole('link', { name: /Ver más/ }).click();
		await expect(rows.filter({ visible: true })).toHaveCount(17);
		const tabs = page.getByRole('navigation', { name: 'Navegación', exact: true });
		await expect(tabs.getByRole('link')).toHaveText([
			/^\s*Campañas\s*$/,
			/^\s*Aprobaciones\s*13\s*$/,
			/^\s*Kits\s*$/,
			/^\s*Soporte\s*1\s*$/,
			/^\s*Más secciones\s*$/
		]);
	});

	test('tema: el conmutador cambia y se recuerda', async ({ page }) => {
		await page.getByRole('button', { name: 'Cuenta de Jorge Martín' }).click();
		const saved = page.waitForResponse((r) => r.url().endsWith('/tema') && r.status() === 204);
		await page.getByRole('button', { name: 'Oscuro' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await saved;
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.goto('/cuenta');
		await page.getByRole('button', { name: 'Sistema' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
	});
});
