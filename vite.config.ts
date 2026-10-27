import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), sveltekit()],
	server: { port: 5173, strictPort: true },
	preview: { port: 4173, strictPort: true },
	test: {
		environment: 'node',
		env: { ...loadEnv(mode, process.cwd(), ''), MAIL_OUTBOX_DIR: 'test-results/mail' },
		projects: [
			{ extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['tests/integration/**/*.test.ts'],
					fileParallelism: false
				}
			}
		]
	}
}));
