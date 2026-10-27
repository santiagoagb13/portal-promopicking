import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stateOf } from './users';
import { horizontalOverflow } from './helpers';

const NAME = `Verano VIPS ${Date.now().toString(36)}`;
let campaignUrl = '';

async function asUser(
	browser: import('@playwright/test').Browser,
	user: 'jorge' | 'marta' | 'carlos'
) {
	const context = await browser.newContext({
		storageState: stateOf(user),
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid'
	});
	return { context, page: await context.newPage() };
}

test.describe.serial('Fase 2 · un admin crea una campaña y solo la ve su marca', () => {
	test('Jorge crea una campaña de VIPS desde el panel lateral y le añade un soporte', async ({
		browser
	}) => {
		const { context, page } = await asUser(browser, 'jorge');
		await page.goto('/campanas');
		await page.getByRole('link', { name: 'Nueva campaña' }).click();
		await expect(page.getByRole('dialog', { name: 'Nueva campaña' })).toBeVisible();
		const drawer = page.locator('#nueva-campana');
		await drawer.locator('select[name=brandCode]').selectOption('VIPS');
		await expect(drawer.locator('input[name=restaurantCount]')).toHaveValue('170');
		await drawer.locator('input[name=name]').fill(NAME);
		await drawer.locator('input[name=inRestaurantOn]').fill('2027-06-15');
		await drawer.locator('select[name=ownerUserId]').selectOption({ label: 'Carlos Vega' });
		await drawer.getByRole('button', { name: 'Crear campaña' }).click();

		await expect(page).toHaveURL(/\/campanas\/VI-27-\d{2}\?creada=1$/);
		// Sin JS el mismo alta funciona como página propia.
		expect((await page.request.get('/campanas/nueva')).status()).toBe(200);
		campaignUrl = new URL(page.url()).pathname;
		await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
		await expect(page.getByText('Campaña creada. Añade sus soportes.')).toBeVisible();
		await expect(page.getByRole('list', { name: 'Fases' }).getByRole('listitem')).toHaveCount(7);

		await page.getByRole('link', { name: 'Añadir soporte' }).click();
		const sd = page.getByRole('dialog', { name: 'Nuevo soporte' });
		await sd.getByLabel('Nombre').fill('Cartel campaña 70×100');
		await sd.getByLabel('Versiones').fill('3');
		await sd.getByLabel('Tirada (uds)').fill('510');
		await sd.getByRole('button', { name: 'Añadir soporte' }).click();
		await expect(sd).toBeHidden();
		await expect(page.getByRole('table', { name: 'Soportes de la campaña' })).toContainText(
			'Cartel campaña 70×100'
		);
		await context.close();
	});

	test('Carlos (VIPS) la ve en su panel y en el calendario', async ({ browser }) => {
		const { context, page } = await asUser(browser, 'carlos');
		await page.goto(`/campanas?q=${encodeURIComponent(NAME)}`);
		await expect(page.getByRole('table', { name: 'Campañas' })).toContainText(NAME);
		await page.goto('/campanas?vista=calendario&mes=2027-06');
		await expect(page.getByRole('region', { name: 'Calendario de hitos' })).toContainText(NAME);
		await page.goto(campaignUrl);
		await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
		// Marketing de marca no edita campañas.
		await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
		await context.close();
	});

	test("Marta (Foster's) no la ve ni entrando por la URL", async ({ browser }) => {
		const { context, page } = await asUser(browser, 'marta');
		await page.goto(`/campanas?q=${encodeURIComponent(NAME)}`);
		await expect(page.getByText('Ninguna campaña coincide con la búsqueda.')).toBeVisible();
		expect((await page.goto(campaignUrl))?.status()).toBe(404);
		expect((await page.goto('/admin/ajustes'))?.status()).toBe(403);
		// La acción de alta la rechaza el servidor aunque se llame a mano.
		const res = await page.request.post('/campanas/nueva?/crear', {
			form: {
				brandCode: 'FH',
				name: 'Intento',
				inRestaurantOn: '2027-01-01',
				restaurantCount: '5'
			},
			headers: { origin: 'http://localhost:4173' }
		});
		expect(res.status()).toBe(403);
		await context.close();
	});

	test('archivar exige escribir el nombre y la saca del panel', async ({ browser }) => {
		const { context, page } = await asUser(browser, 'jorge');
		await page.goto(campaignUrl);
		await page.getByRole('link', { name: 'Archivar' }).click();
		const dlg = page.getByRole('dialog', { name: '¿Archivar la campaña?' });
		const confirm = dlg.getByRole('button', { name: 'Archivar' });
		await dlg.getByLabel(/Escribe/).fill('otro nombre');
		await expect(confirm).toBeDisabled();
		await dlg.getByLabel(/Escribe/).fill(NAME);
		await confirm.click();
		await expect(page.getByText('Archivada', { exact: true })).toBeVisible();
		await page.goto(`/campanas?q=${encodeURIComponent(NAME)}`);
		await expect(page.getByText('Ninguna campaña coincide con la búsqueda.')).toBeVisible();
		await context.close();
	});
});

test.describe('Maestro', () => {
	test.use({ storageState: stateOf('jorge') });

	test('cambiar la tarifa pide confirmación y queda en el histórico', async ({ page }) => {
		await page.goto('/maestro?ficha=FH-0088');
		const ficha = page.getByRole('dialog', { name: /FH Nervión Plaza/ });
		await ficha.getByLabel('Tarifa').selectOption('C3');
		await ficha.getByRole('button', { name: 'Guardar' }).click();
		await expect(ficha.getByText('Cambia la versión que recibe este restaurante')).toBeVisible();
		await ficha.getByRole('button', { name: 'Guardar igualmente' }).click();
		await page.goto('/maestro?ficha=FH-0088');
		await expect(page.getByRole('dialog', { name: /FH Nervión Plaza/ })).toContainText(
			'Tarifa: C2 → C3'
		);
	});

	test('importar un CSV: previsualizar y aplicar', async ({ page }) => {
		await page.goto('/maestro?importar=1');
		const csv =
			'Código;Marca;Nombre;Ciudad;Dirección;Tarifa;Idioma;Surtido;Fachada;Entrega\r\n' +
			'GI-0901;GINOS;Ginos Prueba E2E;Bilbao;Gran Vía 1;M3;CAST;Completa;;Plataforma Promopicking\r\n';
		const dlg = page.getByRole('dialog', { name: 'Importar Excel' });
		await dlg
			.getByLabel('Fichero')
			.setInputFiles({ name: 'ginos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
		await dlg.getByRole('button', { name: 'Previsualizar' }).click();
		await expect(page).toHaveURL(/\/maestro\/importar\//);
		const counts = page.getByRole('region', { name: 'Resumen' });
		await expect(counts).toContainText(/1\s*altas/);
		await expect(counts).toContainText(/8\s*bajas/);
		await page.getByRole('link', { name: 'Aplicar' }).click();
		await page
			.getByRole('dialog', { name: /Aplicar 1 altas/ })
			.getByRole('button', { name: 'Aplicar' })
			.click();
		await expect(page).toHaveURL(/\/maestro\?importado=1-0-8/);
		await page.goto('/maestro?q=Prueba%20E2E');
		await expect(page.getByRole('table', { name: 'Restaurantes' })).toContainText('GI-0901');
	});
});

test('pantallas nuevas sin scroll horizontal de 375 a 1440 px, con capturas', async ({
	browser
}) => {
	const { context, page } = await asUser(browser, 'jorge');
	mkdirSync('tests/e2e/capturas', { recursive: true });
	const pages: [string, string, (p: Page) => Promise<void>][] = [
		[
			'calendario',
			'/campanas?vista=calendario',
			(p) => expect(p.getByRole('region', { name: 'Calendario de hitos' })).toBeVisible()
		],
		[
			'detalle',
			'/campanas/FH-26-03',
			(p) => expect(p.getByRole('list', { name: 'Fases' })).toBeVisible()
		],
		[
			'maestro',
			'/maestro',
			(p) => expect(p.getByRole('table', { name: 'Restaurantes' })).toBeVisible()
		],
		[
			'usuarios',
			'/admin/usuarios',
			(p) => expect(p.getByRole('table', { name: 'Usuarios' })).toBeVisible()
		],
		['auditoria', '/admin/auditoria', (p) => expect(p.getByText(/registros/)).toBeVisible()]
	];
	for (const width of [375, 768, 1024, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		for (const [name, url, ready] of pages) {
			await page.goto(url);
			await ready(page);
			expect(await horizontalOverflow(page), `${name} a ${width} px`).toBeLessThanOrEqual(0);
			if (width === 375 || width === 1440)
				await page.screenshot({ path: `tests/e2e/capturas/${name}-${width}.png`, fullPage: true });
		}
	}
	await context.close();
});
