import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { stateOf, type USERS } from './users';

/**
 * Presupuesto de rendimiento (9.2): JS comprimido por ruta < 60 KB (informes y maestro < 30 KB),
 * CSS < 20 KB y menos de 15 peticiones en la carga inicial.
 */
const ROUTES: [keyof typeof USERS, string, number][] = [
	['jorge', '/campanas', 60],
	['jorge', '/campanas/FH-26-09', 60],
	['marta', '/aprobaciones', 60],
	['jorge', '/kits', 60],
	['jorge', '/kits/escaneo', 60],
	['ana', '/kits/recepcion', 60],
	['jorge', '/qr', 60],
	['ana', '/reposiciones', 60],
	['jorge', '/soporte', 60],
	['jorge', '/informes', 30],
	['jorge', '/maestro', 30],
	['jorge', '/admin', 60],
	['jorge', '/cuenta', 60]
];

async function weigh(page: Page, kind: 'script' | 'css') {
	const urls = await page.evaluate(
		(k) =>
			performance
				.getEntriesByType('resource')
				.map((e) => e.name)
				.filter(
					(n) => n.includes('/_app/') && (k === 'css' ? n.endsWith('.css') : n.endsWith('.js'))
				),
		kind
	);
	let total = 0;
	for (const url of urls) total += gzipSync(await (await page.request.get(url)).body()).length;
	return { total, files: urls.length };
}

for (const [user, path, budget] of ROUTES) {
	test(`presupuesto de ${path} (${budget} KB de JS)`, async ({ browser }) => {
		const context = await browser.newContext({ storageState: stateOf(user) });
		const page = await context.newPage();
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		const js = await weigh(page, 'script');
		const css = await weigh(page, 'css');
		const requests = await page.evaluate(() => performance.getEntriesByType('resource').length + 1);
		console.info(
			`${path}: JS ${(js.total / 1024).toFixed(1)} KB en ${js.files} ficheros · CSS ${(css.total / 1024).toFixed(1)} KB · ${requests} peticiones`
		);
		expect.soft(js.total, 'JS comprimido').toBeLessThan(budget * 1024);
		expect.soft(css.total, 'CSS comprimido').toBeLessThan(20 * 1024);
		await context.close();
	});
}
