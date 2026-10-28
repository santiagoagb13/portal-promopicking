import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { horizontalOverflow } from './helpers';
import { stateOf, type USERS } from './users';

/**
 * Pruebas por perfil (fase 7): cada persona recorre las secciones de su navegación, que cargan
 * sin errores, sin problemas de accesibilidad graves (axe, WCAG 2.1 AA) y sin desbordar el móvil;
 * y las secciones fuera de su perfil le responden 403.
 */
const PROFILES: { user: keyof typeof USERS; forbidden: string[] }[] = [
	{ user: 'jorge', forbidden: [] },
	{ user: 'marta', forbidden: ['/admin/auditoria', '/kits/escaneo', '/kits/recepcion'] },
	{ user: 'carlos', forbidden: ['/admin/ajustes', '/kits/recepcion'] },
	{ user: 'ana', forbidden: ['/maestro', '/qr', '/aprobaciones', '/admin'] }
];

async function sections(browser: Browser, user: keyof typeof USERS) {
	const context = await browser.newContext({ storageState: stateOf(user) });
	const page = await context.newPage();
	await page.goto('/campanas');
	const hrefs = await page
		.getByRole('complementary', { name: 'Navegación principal' })
		.getByRole('navigation')
		.getByRole('link')
		.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
	await context.close();
	return [...new Set([...hrefs, '/cuenta', '/notificaciones'])];
}

for (const { user, forbidden } of PROFILES) {
	test.describe(`perfil ${user}`, () => {
		test('sus secciones cargan, son accesibles y caben en el móvil', async ({ browser }) => {
			const paths = await sections(browser, user);
			expect(paths.length).toBeGreaterThan(3);
			for (const path of paths) {
				for (const viewport of [
					{ width: 1280, height: 900 },
					{ width: 375, height: 812 }
				]) {
					const context = await browser.newContext({ storageState: stateOf(user), viewport });
					const page = await context.newPage();
					const res = await page.goto(path);
					expect(res?.status(), `${path} a ${viewport.width} px`).toBe(200);
					await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
					if (viewport.width === 375)
						expect(await horizontalOverflow(page), `${path} desborda`).toBeLessThanOrEqual(0);
					const axe = await new AxeBuilder({ page })
						.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
						.analyze();
					const serious = axe.violations.filter(
						(v) => v.impact === 'serious' || v.impact === 'critical'
					);
					expect(
						serious.map(
							(v) =>
								`${v.id}: ${v.nodes
									.map((n) => n.target.join(' '))
									.slice(0, 3)
									.join(' | ')}`
						),
						`${path} a ${viewport.width} px`
					).toEqual([]);
					await context.close();
				}
			}
		});

		if (forbidden.length)
			test('lo que no es de su perfil responde 403', async ({ browser }) => {
				const context = await browser.newContext({ storageState: stateOf(user) });
				const page = await context.newPage();
				for (const path of forbidden) {
					const res = await page.request.get(path, { maxRedirects: 0 });
					expect(res.status(), path).toBe(403);
				}
				await context.close();
			});
	});
}

test('modo oscuro: las pantallas principales mantienen el contraste', async ({ browser }) => {
	const context = await browser.newContext({ storageState: stateOf('jorge'), colorScheme: 'dark' });
	const page = await context.newPage();
	for (const path of [
		'/campanas',
		'/aprobaciones',
		'/kits',
		'/reposiciones',
		'/soporte',
		'/informes',
		'/maestro'
	]) {
		await page.goto(path);
		const axe = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
		const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
		expect(
			serious.map(
				(v) =>
					`${v.id}: ${v.nodes
						.map((n) => n.target.join(' '))
						.slice(0, 3)
						.join(' | ')}`
			),
			path
		).toEqual([]);
	}
	await context.close();
});

test('el aviso legal se lee sin sesión y enlaza desde el acceso', async ({ page }) => {
	await page.goto('/acceso');
	await page.getByRole('link', { name: 'Aviso legal y privacidad' }).click();
	await expect(page).toHaveURL(/\/aviso-legal$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aviso legal y privacidad');
	await expect(page.getByText('Solo cookies técnicas')).toBeVisible();
	const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
	expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
		[]
	);
});
