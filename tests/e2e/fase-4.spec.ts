import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { E2E_ENV } from '../../playwright.config';
import { horizontalOverflow } from './helpers';
import { stateOf, type USERS } from './users';

const KIT = 'K-FH2609-0147';
const PHONE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };

async function device(browser: Browser, user: keyof typeof USERS, extra = {}) {
	const context = await browser.newContext({
		storageState: stateOf(user),
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		...extra
	});
	return { context, page: await context.newPage() };
}

test.describe
	.serial('Fase 4 · un kit recorre los 5 estados desde tres dispositivos, uno sin cobertura', () => {
	test.afterAll(() => {
		execSync('npm run db:seed', { stdio: 'ignore', env: { ...process.env, ...E2E_ENV } });
	});

	test('1 · Promopicking genera los kits de la campaña', async ({ browser }) => {
		const { context, page } = await device(browser, 'jorge');
		await page.goto('/kits?campana=FH-26-09');
		await page.getByRole('link', { name: 'Generar kits' }).click();
		await page
			.getByRole('dialog', { name: /Generar los kits de FH-26-09/ })
			.getByRole('button', { name: 'Generar kits' })
			.click();
		await expect(page.getByRole('status')).toContainText('10 kits generados');
		await expect(page.getByRole('table', { name: 'Kits' })).toContainText(KIT);
		await context.close();
	});

	test('2 · escritorio de expedición: la pistola escribe el código y Enter', async ({
		browser
	}) => {
		const { context, page } = await device(browser, 'jorge');
		await page.goto('/kits/escaneo');
		await expect(page.getByLabel('Expedición')).toBeChecked();
		const field = page.getByLabel('Código del kit (pistola o teclado)');
		await field.fill(KIT);
		await field.press('Enter');
		const full = page.locator('button.full');
		await expect(full).toContainText(KIT);
		await expect(full).toContainText('FH Plenilunio');
		await expect(full).toContainText('Expedición');
		await context.close();
	});

	test('3 · móvil de plataforma sin cobertura: dos lecturas a la cola y se envían al volver la red', async ({
		browser
	}) => {
		const { context, page } = await device(browser, 'jorge', PHONE);
		await page.goto('/kits/escaneo?paso=hub_in');
		await expect(page.getByLabel('Entrada en plataforma')).toBeChecked();
		await context.setOffline(true);
		await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
		const field = page.getByLabel('Código del kit (pistola o teclado)');
		await field.fill(`https://portal.example/k/${KIT}/1`);
		await field.press('Enter');
		await expect(page.locator('button.full')).toContainText('Sin conexión: guardado');
		await page.locator('button.full').click();
		await page.getByText('Salida a reparto').click();
		await field.fill(KIT);
		await field.press('Enter');
		await page.locator('button.full').click();
		await expect(page.getByText('2 en cola')).toBeVisible();
		await context.setOffline(false);
		await expect(page.getByText(/en cola/)).toHaveCount(0, { timeout: 15_000 });
		await page.goto(`/kits/${KIT}`);
		await expect(page.getByText('En reparto', { exact: true }).first()).toBeVisible();
		await context.close();
	});

	test('4 · móvil del restaurante: el gerente marca los bultos y confirma a pantalla completa', async ({
		browser
	}) => {
		const { context, page } = await device(browser, 'ana', PHONE);
		await page.goto('/kits/recepcion');
		const kit = page.locator(`article#${KIT}`);
		const confirm = kit.getByRole('button', { name: 'Confirmar recepción' });
		await expect(confirm).toBeDisabled();
		await kit.getByText('Bulto 1/1').tap();
		await confirm.tap();
		const full = page.getByRole('dialog', { name: `¿Confirmar la recepción de ${KIT}?` });
		await full.getByRole('button', { name: 'Confirmar recepción' }).tap();
		await expect(page.locator('button.full')).toContainText('Recepción confirmada');
		await page.goto(`/kits/${KIT}`);
		const trace = page.getByRole('list', { name: 'Trazabilidad' });
		await expect(trace.getByRole('listitem')).toHaveCount(5);
		await expect(trace).not.toContainText('—');
		await expect(page.getByText('Recepción en restaurante')).toBeVisible();
		await context.close();
	});

	test('5 · incidencia con foto desde el móvil del restaurante', async ({ browser }) => {
		const { context, page } = await device(browser, 'ana', PHONE);
		await page.goto('/kits/recepcion');
		const kit = page.locator('article#K-FH2607-0147');
		await kit.getByRole('button', { name: 'Abrir incidencia' }).tap();
		await kit.getByLabel('Tipo').selectOption('Bulto dañado');
		await kit.getByLabel('Qué ha pasado').fill('La caja llegó aplastada y faltan 5 encartes');
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]);
		await kit
			.getByLabel('Foto')
			.setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: jpeg });
		await kit.getByRole('button', { name: 'Enviar incidencia' }).tap();
		await expect(page.locator('button.full')).toContainText('Incidencia enviada');
		await context.close();
		const desk = await device(browser, 'jorge');
		await desk.page.goto('/notificaciones');
		await expect(
			desk.page.getByRole('link', { name: /INC-\d+ · Bulto dañado · FH Plenilunio/ })
		).toBeVisible();
		await desk.context.close();
	});

	test('pantallas de kits sin scroll horizontal, con capturas', async ({ browser }) => {
		mkdirSync('tests/e2e/capturas', { recursive: true });
		const { context, page } = await device(browser, 'jorge');
		for (const [w, h] of [
			[375, 812],
			[1024, 768],
			[1440, 900]
		] as const) {
			await page.setViewportSize({ width: w, height: h });
			for (const [name, url] of [
				['kits', '/kits?campana=VI-26-03b'],
				['kit', '/kits/K-VI2603b-0023'],
				['escaneo', '/kits/escaneo'],
				['etiquetas', '/kits/etiquetas?kit=K-VI2603b-0007']
			] as const) {
				await page.goto(url);
				await page.waitForLoadState('networkidle');
				expect(await horizontalOverflow(page), `${name} a ${w} px`).toBeLessThanOrEqual(0);
				if (w !== 1024)
					await page.screenshot({ path: `tests/e2e/capturas/${name}-${w}.png`, fullPage: true });
			}
		}
		await context.close();
	});
});
