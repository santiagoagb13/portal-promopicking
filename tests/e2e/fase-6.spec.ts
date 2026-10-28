import { execSync } from 'node:child_process';
import { expect, test, type Browser } from '@playwright/test';
import { E2E_ENV } from '../../playwright.config';
import { pdfText } from '../support/pdf-text';
import { horizontalOverflow } from './helpers';
import { stateOf, type USERS } from './users';

const PHONE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };
// PNG de 2×2 px: basta para que el móvil la reduzca a JPEG y el servidor la acepte.
const PHOTO = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8Dwn4GBgYmBgYGBAQAWBgICi4zGWQAAAABJRU5ErkJggg==',
	'base64'
);

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
	.serial('Fase 6 · soporte: una incidencia del restaurante se responde y se cierra', () => {
	let id = '';
	test.afterAll(() => {
		execSync('npm run db:seed', { stdio: 'ignore', env: { ...process.env, ...E2E_ENV } });
	});

	test('1 · el gerente abre una incidencia con foto desde el móvil', async ({ browser }) => {
		const { context, page } = await device(browser, 'ana', PHONE);
		await page.goto('/soporte');
		await page.getByRole('link', { name: 'Nuevo registro' }).click();
		const form = page.locator('#nuevo');
		await form.getByLabel('Tipo y motivo').selectOption('Bulto dañado');
		await form.getByLabel('Campaña').selectOption({ label: 'Menú Navidad FH · FH-26-09' });
		await form.getByLabel('Texto').fill('El bulto 2 llegó roto\nFaltan 3 encartes.');
		await form
			.getByLabel('Foto (opcional)')
			.setInputFiles({ name: 'bulto.png', mimeType: 'image/png', buffer: PHOTO });
		await form.getByRole('button', { name: 'Enviar' }).click();
		const detail = page.locator('#registro');
		await expect(detail).toBeVisible();
		id = (await detail.locator('h2').first().textContent())!.trim();
		expect(id).toMatch(/^INC-\d+$/);
		await expect(detail.getByText('El bulto 2 llegó roto')).toHaveCount(2);
		await expect(detail.getByRole('img', { name: /Foto adjunta por Ana Soler/ })).toBeVisible();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await context.close();
	});

	test('2 · Operaciones responde, sube la severidad y la cierra', async ({ browser }) => {
		const { context, page } = await device(browser, 'jorge');
		await page.goto('/soporte?tipo=incident');
		await page.getByRole('link', { name: new RegExp(id) }).click();
		const detail = page.locator('#registro');
		await detail.getByLabel('Respuesta').fill('Repuesto en la ruta de mañana.');
		await detail.getByRole('button', { name: 'Responder' }).click();
		await expect(detail.getByText('Respondida', { exact: true })).toBeVisible();
		await detail.getByLabel('Severidad').selectOption('high');
		await detail.getByRole('button', { name: 'Cambiar' }).click();
		await expect(detail.getByText('Severidad alta', { exact: true }).first()).toBeVisible();
		await detail.getByRole('link', { name: 'Cerrar registro' }).click();
		await page
			.getByRole('dialog', { name: `¿Cerrar ${id}?` })
			.getByRole('button', { name: 'Cerrar registro' })
			.click();
		await expect(detail.getByText('Cerrada', { exact: true }).first()).toBeVisible();
		await context.close();
	});

	test('3 · el gerente la ve cerrada y puede reabrirla', async ({ browser }) => {
		const { context, page } = await device(browser, 'ana', PHONE);
		await page.goto(`/soporte?todas=1&abrir=${id}`);
		const detail = page.locator('#registro');
		await expect(detail.getByText('Repuesto en la ruta de mañana.')).toBeVisible();
		await detail.getByRole('button', { name: 'Reabrir' }).click();
		await expect(
			detail.getByText('Abierta', { exact: true }).or(detail.getByText('En curso', { exact: true }))
		).toBeVisible();
		await context.close();
	});
});

test('Fase 6 · el informe exportado en PDF coincide con los datos de la página', async ({
	browser
}) => {
	const { context, page } = await device(browser, 'jorge');
	await page.goto('/informes?marca=FH&periodo=trimestre');
	const values = await page.locator('[data-kpi] b').allTextContents();
	expect(values).toHaveLength(5);
	const pdf = await page.request.get('/informes/pdf?marca=FH&periodo=trimestre');
	expect(pdf.headers()['content-type']).toBe('application/pdf');
	const text = await pdfText(new Uint8Array(await pdf.body()));
	for (const v of values) expect(text).toContain(v.replace(/\u00a0/g, ' ').trim());
	expect(text).toContain("Foster's Hollywood · Último trimestre");
	const csv = await (
		await page.request.get('/informes/csv/otif?marca=FH&periodo=trimestre')
	).text();
	expect(csv.trim().split('\r\n')).toHaveLength(4);
	await page.setViewportSize({ width: 375, height: 812 });
	expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
	await context.close();
});
