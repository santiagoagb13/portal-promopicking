import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { samplePdfForTests } from './sample-pdf';
import { horizontalOverflow } from './helpers';
import { stateOf } from './users';
import { E2E_ENV } from '../../playwright.config';

const IPAD = {
	viewport: { width: 810, height: 1080 },
	hasTouch: true,
	isMobile: true,
	userAgent:
		'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};
const SUPPORT = 'Carta surtido FH (tríptico 222×320)';

async function as(browser: Browser, user: 'jorge' | 'marta', extra = {}) {
	const context = await browser.newContext({
		storageState: stateOf(user),
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		...extra
	});
	return { context, page: await context.newPage() };
}

test.describe.serial('Fase 3 · Marta aprueba desde el iPad y Jorge recibe el aviso', () => {
	// Las pruebas cambian estados de versiones: al terminar se deja la BD como la deja el seed.
	test.afterAll(() => {
		execSync('npm run db:seed', { stdio: 'ignore', env: { ...process.env, ...E2E_ENV } });
	});

	test('Marta aprueba una versión desde el iPad (dos columnas y visor a pantalla completa)', async ({
		browser
	}) => {
		const { context, page } = await as(browser, 'marta', IPAD);
		await page.goto('/aprobaciones');
		await page.getByRole('link', { name: new RegExp(SUPPORT.replace(/[()×]/g, '.')) }).tap();
		await expect(page).toHaveURL(/soporte=fh-cs/);
		await page.getByRole('link', { name: /C2 ALL CAT/ }).tap();
		const visor = page.getByRole('region', { name: 'Visor' });
		await expect(visor.getByText('C2 ALL CAT', { exact: true })).toBeVisible();
		await expect(visor.getByRole('img', { name: /Exterior de C2 ALL CAT/ })).toBeVisible();
		await visor.getByRole('link', { name: 'Aprobar C2 ALL CAT' }).tap();
		const dlg = page.getByRole('dialog', { name: '¿Aprobar C2 ALL CAT?' });
		await dlg.getByRole('button', { name: 'Aprobar' }).tap();
		await expect(page.getByRole('status')).toContainText('C2 ALL CAT aprobada');
		await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
		await expect(visor.getByText('Aprobada', { exact: true })).toBeVisible();
		await context.close();
	});

	test('Jorge ve el aviso en la campana', async ({ browser }) => {
		const { context, page } = await as(browser, 'jorge');
		await page.goto('/campanas');
		await expect(page.getByRole('link', { name: /Notificaciones: \d+ sin leer/ })).toBeVisible();
		await page.goto('/notificaciones');
		const n = page.getByRole('link', { name: /Marta Ruiz ha aprobado C2 ALL CAT/ });
		await expect(n).toBeVisible();
		await n.click();
		await expect(page).toHaveURL(/\/aprobaciones\?soporte=fh-cs&version=/);
		await context.close();
	});

	test('pedir cambios exige un comentario y lo deja en el hilo', async ({ browser }) => {
		const { context, page } = await as(browser, 'marta');
		await page.goto('/aprobaciones?soporte=fh-cs&version=sv-FH-CS-08');
		await page.getByRole('link', { name: 'Pedir cambios' }).click();
		const dlg = page.getByRole('dialog', { name: '¿Pedir cambios en C2 ALL GALL?' });
		await dlg.getByLabel('Qué hay que cambiar').fill('Falta el texto en gallego del menú infantil');
		await dlg.getByRole('button', { name: 'Pedir cambios' }).click();
		await expect(page.getByRole('region', { name: 'Comentarios' })).toContainText(
			'Falta el texto en gallego del menú infantil'
		);
		await expect(
			page.getByRole('region', { name: 'Visor' }).getByText('Cambios pedidos', { exact: true })
		).toBeVisible();
		await context.close();
	});

	test('Jorge sube dos PDF, revisa los códigos y publica', async ({ browser }) => {
		const { context, page } = await as(browser, 'jorge');
		await page.goto('/aprobaciones?soporte=fh-cs');
		// En escritorio se abre sola la primera versión pendiente: se espera a esa navegación.
		await expect(page).toHaveURL(/version=/);
		await page.getByRole('link', { name: 'Subir artes finales' }).click();
		await expect(page.getByRole('dialog', { name: /Subir artes/ })).toBeVisible();
		const drawer = page.locator('#subir');
		await drawer.locator('input[name=ficheros]').setInputFiles([
			{
				name: 'FH-01_C2-ALL-GALL_v2.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from(await samplePdfForTests('C2 ALL GALL', 2))
			},
			{
				name: 'FH-01_C4-ALL-SP_v1.pdf',
				mimeType: 'application/pdf',
				buffer: Buffer.from(await samplePdfForTests('C4 ALL SP', 1))
			}
		]);
		await drawer.getByRole('button', { name: 'Subir y revisar' }).click();
		await expect(page).toHaveURL(/\/aprobaciones\/subidas\//);
		await expect(page.getByText('Nueva revisión de C2 ALL GALL (rev. 2)')).toBeVisible();
		await expect(page.getByText('Versión nueva')).toBeVisible();
		await page.getByRole('link', { name: 'Publicar 2 versiones' }).click();
		await page
			.getByRole('dialog', { name: /Publicar 2 versiones/ })
			.getByRole('button', { name: 'Publicar' })
			.click();
		await expect(page).toHaveURL(/\/aprobaciones\?soporte=fh-cs&vf=pendientes/);
		const list = page.getByRole('region', { name: 'Versiones' });
		await expect(list.getByRole('link', { name: /C4 ALL SP/ })).toBeVisible();
		await expect(list.getByRole('link', { name: /C2 ALL GALL\s*rev\. 2/ })).toBeVisible();
		await context.close();
	});

	test('acta de aprobación en PDF', async ({ browser }) => {
		const { context, page } = await as(browser, 'marta');
		const res = await page.request.get('/aprobaciones/acta/fh-tg');
		expect(res.headers()['content-type']).toBe('application/pdf');
		expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
		expect((await page.request.get('/aprobaciones/acta/vi7-cg')).status()).toBe(404);
		await context.close();
	});

	test('pantalla de aprobación sin scroll horizontal, con capturas', async ({ browser }) => {
		mkdirSync('tests/e2e/capturas', { recursive: true });
		const { context, page } = await as(browser, 'marta');
		for (const [w, h] of [
			[375, 812],
			[810, 1080],
			[1024, 768],
			[1440, 900]
		] as const) {
			await page.setViewportSize({ width: w, height: h });
			await page.goto('/aprobaciones?soporte=fh-cs&version=sv-FH-CS-09');
			await expect(
				page.getByRole('region', { name: 'Visor' }).getByText('C2 RED+ SP', { exact: true })
			).toBeVisible();
			expect(await horizontalOverflow(page), `${w} px`).toBeLessThanOrEqual(0);
			await page.screenshot({ path: `tests/e2e/capturas/aprobacion-${w}.png` });
		}
		await context.close();
	});
});
