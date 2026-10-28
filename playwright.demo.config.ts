import { defineConfig, devices } from '@playwright/test';

/**
 * Modo pruebas (ADR 0013): la misma compilación servida con PORTAL_DEMO=1, ficheros en Postgres y
 * sin AUTH_SECRET, como en la demo de Vercel. `npm run test:demo`.
 */
const PORT = 4174;
export const DEMO_ORIGIN = `http://localhost:${PORT}`;
export const DEMO_ENV = {
	PORTAL_DEMO: '1',
	AUTH_SECRET: '',
	AUTH_ORIGIN: DEMO_ORIGIN,
	STORAGE_PROVIDER: 'database',
	MAIL_PROVIDER: ''
};

export default defineConfig({
	testDir: 'tests/e2e-demo',
	fullyParallel: false,
	workers: 1,
	reporter: 'line',
	outputDir: 'test-results/playwright-demo',
	globalSetup: './tests/e2e-demo/global-setup.ts',
	use: {
		baseURL: DEMO_ORIGIN,
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		trace: 'retain-on-failure',
		...devices['Desktop Chrome']
	},
	webServer: {
		command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
		url: `${DEMO_ORIGIN}/salud`,
		reuseExistingServer: false,
		timeout: 240_000,
		env: { ...process.env, ...DEMO_ENV } as Record<string, string>
	}
});
