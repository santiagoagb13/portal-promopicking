import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const ORIGIN = `http://localhost:${PORT}`;
/** Bandeja de correo de las pruebas (el portal la escribe sin MAIL_PROVIDER). */
export const OUTBOX = 'test-results/mail/outbox.jsonl';

const env = {
	AUTH_ORIGIN: ORIGIN,
	APP_REFERENCE_DATE: '2026-10-22',
	MAIL_OUTBOX_DIR: 'test-results/mail',
	// Compilación de producción servida en local: permite la bandeja de correo de pruebas.
	PORTAL_ENTORNO: 'pruebas'
};

export default defineConfig({
	testDir: 'tests/e2e',
	outputDir: 'test-results/playwright',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	globalSetup: './tests/e2e/global-setup.ts',
	use: {
		baseURL: ORIGIN,
		locale: 'es-ES',
		timezoneId: 'Europe/Madrid',
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'npm run build && npx vite preview --port 4173 --strictPort',
		url: `${ORIGIN}/acceso`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		env: { ...process.env, ...env } as Record<string, string>
	}
});

export { env as E2E_ENV };
