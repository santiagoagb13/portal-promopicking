/**
 * Lighthouse en móvil sobre las 5 pantallas principales (criterio de la fase 7: ≥ 95).
 * Uso: con la compilación servida en local (`npm run build && npx vite preview --port 4173`) y
 * las sesiones de las pruebas guardadas (`npx playwright test --project=sesiones`):
 *   node scripts/lighthouse.mjs [origen]
 * Usa el Chromium de Playwright y descarga Lighthouse con npx la primera vez (no es dependencia).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ORIGIN = process.argv[2] ?? 'http://localhost:4173';
const SCREENS = [
	['jorge', '/campanas'],
	['marta', '/aprobaciones'],
	['ana', '/kits/recepcion'],
	['ana', '/reposiciones'],
	['jorge', '/informes']
];
const OUT = 'test-results/lighthouse';
mkdirSync(OUT, { recursive: true });

const cookieFor = (user) =>
	JSON.parse(readFileSync(`tests/e2e/.auth/${user}.json`, 'utf8'))
		.cookies.map((c) => `${c.name}=${c.value}`)
		.join('; ');

let failed = false;
for (const [user, path] of SCREENS) {
	const file = `${OUT}/${path.replaceAll('/', '_').slice(1)}.json`;
	// Lighthouse a veces no graba la traza de la carga (NO_NAVSTART): se reintenta una vez.
	const run = () =>
		execFileSync(
			'npx',
			[
				'-y',
				'lighthouse@12.8.2',
				`${ORIGIN}${path}`,
				'--quiet',
				'--form-factor=mobile',
				'--only-categories=performance,accessibility,best-practices,seo',
				`--extra-headers=${JSON.stringify({ Cookie: cookieFor(user) })}`,
				'--chrome-flags=--headless=new --no-first-run',
				'--output=json',
				`--output-path=${file}`
			],
			{ stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } }
		);
	try {
		run();
	} catch {
		run();
	}
	const r = JSON.parse(readFileSync(file, 'utf8'));
	const scores = Object.fromEntries(
		Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)])
	);
	const min = Math.min(...Object.values(scores));
	if (min < 95) failed = true;
	console.log(`${min < 95 ? '✗' : '✓'} ${path} (${user})`, scores);
}
process.exit(failed ? 1 : 0);
