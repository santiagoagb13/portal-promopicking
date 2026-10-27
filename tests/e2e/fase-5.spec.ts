import { execSync } from 'node:child_process';
import { expect, test, type Browser } from '@playwright/test';
import { E2E_ENV } from '../../playwright.config';
import { horizontalOverflow } from './helpers';
import { stateOf, type USERS } from './users';

const PHONE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };

async function device(browser: Browser, user: keyof typeof USERS | null, extra = {}) {
	const context = await browser.newContext({
		...(user ? { storageState: stateOf(user) } : {}),
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		...extra
	});
	return { context, page: await context.newPage() };
}

test.describe.serial('Fase 5 · un pedido desde QR llega validado a reparto', () => {
	let code = '';
	let ref = '';
	let piece = '';
	test.afterAll(() => {
		execSync('npm run db:seed', { stdio: 'ignore', env: { ...process.env, ...E2E_ENV } });
	});

	test('1 · Promopicking tiene la hoja de QR para la imprenta', async ({ browser }) => {
		const { context, page } = await device(browser, 'jorge');
		await page.goto('/qr');
		await page.getByRole('link', { name: 'Hoja de códigos para la imprenta' }).first().click();
		const fig = page.locator('figure', { hasText: 'FH Plenilunio' }).first();
		await expect(fig.locator('svg')).toBeVisible();
		code = (await fig.locator('b.mono').textContent())!.trim();
		expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
		const csv = await page.request.get(page.url() + '/csv');
		expect(csv.headers()['content-type']).toContain('text/csv');
		expect(await csv.text()).toContain(`/qr/${code}`);
		await context.close();
	});

	test('2 · en el restaurante, sin sesión, se pide reposición desde el QR', async ({ browser }) => {
		const { context, page } = await device(browser, null, PHONE);
		await page.goto(`/qr/${code}`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vigente');
		await expect(page.getByText('FH Plenilunio', { exact: true })).toBeVisible();
		piece = (await page.locator('dd').first().textContent())!.trim();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await page.getByRole('link', { name: 'Pedir reposición' }).click();
		const dlg = page.getByRole('dialog', { name: /Pedir reposición/ });
		await dlg.getByLabel('Unidades').fill('3');
		await dlg.getByRole('button', { name: 'Pedir' }).click();
		const done = page.getByRole('status').filter({ hasText: 'Promopicking lo valida' });
		await expect(done).toBeVisible();
		ref = (await done.textContent())!.match(/REP-\d{4}-\d{4}/)![0];
		await context.close();
	});

	test('3 · Operaciones lo valida y lo saca a reparto; el gerente lo ve', async ({ browser }) => {
		const { context, page } = await device(browser, 'jorge');
		await page.goto('/reposiciones?vista=pedidos');
		const queue = page.getByRole('region', { name: /Pedidos desde QR por validar/ });
		await queue.getByRole('link', { name: ref }).click();
		await expect(page.getByRole('cell', { name: piece })).toBeVisible();
		await page.getByRole('link', { name: 'Aceptar' }).click();
		await page
			.getByRole('dialog', { name: /Aceptar el pedido/ })
			.getByRole('button', { name: 'Aceptar' })
			.click();
		await expect(page.getByText('En preparación', { exact: true })).toBeVisible();
		await page.getByRole('link', { name: 'Marcar en reparto' }).click();
		await page
			.getByRole('dialog', { name: /Marcar en reparto/ })
			.getByRole('button', { name: 'Marcar en reparto' })
			.click();
		await expect(page.getByText('En reparto', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('listitem').filter({ hasText: 'Validado por Promopicking' })
		).toBeVisible();
		await context.close();

		const ana = await device(browser, 'ana', PHONE);
		await ana.page.goto(`/reposiciones/pedidos/${ref}`);
		await expect(ana.page.getByText('En reparto', { exact: true })).toBeVisible();
		await expect(ana.page.getByRole('link', { name: 'Marcar entregado' })).toHaveCount(0);
		await ana.context.close();
	});

	test('4 · el gerente pide del catálogo desde el móvil', async ({ browser }) => {
		const { context, page } = await device(browser, 'ana', PHONE);
		await page.goto('/reposiciones');
		const item = page.getByRole('listitem').filter({ hasText: 'Manteleta celíacos A3' });
		await item.getByRole('button', { name: 'Añadir una' }).click();
		await item.getByRole('button', { name: 'Añadir una' }).click();
		await expect(page.getByText('39,60 € · 2 uds.')).toBeVisible();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await page.getByRole('link', { name: 'Ver pedido' }).click();
		await page
			.getByRole('complementary', { name: /Pedido/ })
			.getByRole('button', { name: 'Enviar pedido' })
			.click();
		const dlg = page.getByRole('dialog', { name: /Enviar el pedido de FH Plenilunio/ });
		await expect(dlg).toContainText('39,60 €');
		await dlg.getByRole('button', { name: 'Enviar pedido' }).click();
		await expect(page.getByRole('status')).toContainText(/Pedido REP-\d{4}-\d{4} enviado/);
		await context.close();
	});

	test('5 · sin JavaScript, el pedido se revisa en el servidor antes de enviarlo', async ({
		browser
	}) => {
		const { context, page } = await device(browser, 'ana', { javaScriptEnabled: false });
		await page.goto('/reposiciones');
		await page
			.getByRole('listitem')
			.filter({ hasText: 'Manteleta celíacos A3' })
			.getByRole('spinbutton')
			.fill('1');
		await page.getByRole('button', { name: 'Enviar pedido' }).click();
		const dlg = page.getByRole('dialog', { name: /Enviar el pedido de FH Plenilunio/ });
		await expect(dlg).toContainText('1 × Manteleta celíacos A3');
		await dlg.getByRole('button', { name: 'Enviar pedido' }).click();
		await expect(page.getByText(/Pedido REP-\d{4}-\d{4} enviado/)).toBeVisible();
		await context.close();
	});
});
