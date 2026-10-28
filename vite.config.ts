import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const SHELL_ICON_NAMES = [
	'arrow-up-down',
	'bell',
	'chart-column',
	'check',
	'circle-alert',
	'ellipsis',
	'file-check',
	'info',
	'life-buoy',
	'log-out',
	'megaphone',
	'monitor',
	'moon',
	'package',
	'package-check',
	'qr-code',
	'refresh-cw',
	'search',
	'shopping-cart',
	'store',
	'sun',
	'user-cog',
	'user-round',
	'x'
];
const SHELL_ICONS = new RegExp(
	`node_modules[\\\\/]@lucide[\\\\/]svelte[\\\\/]dist[\\\\/](Icon\\.svelte|context|defaultAttributes|icons[\\\\/](${SHELL_ICON_NAMES.join('|')})\\.(svelte|js))`
);

const FRAMEWORK =
	/node_modules[\\/](svelte|@sveltejs[\\/]kit|devalue|esm-env|clsx|@sveltejs[\\/]acorn-typescript)[\\/]/;
/**
 * Lo que usan casi todas las rutas: carcasa, componentes base y dominio común. La tabla y el
 * panel lateral van aparte, con las pantallas que los usan (medido en la fase 7: separar todo
 * por pantalla sale peor; juntarlo todo engorda Aprobaciones, que no usa ninguno de los dos).
 */
const SHELL =
	/src[\\/]lib[\\/](components[\\/](shell[\\/]|ui[\\/](?!DataTable|Drawer))|nav\.ts|i18n[\\/]|domain[\\/](dates|campaign)\.ts)/;

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rolldownOptions: {
			output: {
				// Un solo fichero para los iconos de la carcasa (navegación, barra superior, avisos):
				// decenas de módulos diminutos pesan más por separado. Los de cada pantalla van con ella,
				// para que una pantalla nueva no engorde las demás.
				// El marco (Svelte, SvelteKit) y la carcasa en pocos ficheros: menos peticiones en
				// la primera carga (9.2) y mejor compresión que decenas de trozos de 1 KB.
				advancedChunks: {
					groups: [
						{ name: 'marco', test: FRAMEWORK, priority: 30 },
						{ name: 'iconos', test: SHELL_ICONS, priority: 20 },
						{ name: 'carcasa', test: SHELL, priority: 10 }
					]
				}
			}
		}
	},
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
