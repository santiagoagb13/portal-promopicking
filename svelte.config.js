import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

// ADAPTER=node genera un servidor Node autónomo para el VPS (fase 8); por defecto, Vercel.
const adapter =
	process.env.ADAPTER === 'node'
		? adapterNode({ out: 'build' })
		: adapterVercel({ runtime: 'nodejs22.x', regions: ['fra1'] });

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter,
		csp: {
			mode: 'nonce',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// En desarrollo Vite inyecta los estilos con JavaScript; en producción son ficheros.
				'style-src': dev ? ['self', 'unsafe-inline'] : ['self'],
				// Solo el estilo fijo del anunciador de rutas de SvelteKit (#svelte-announcer), por su hash.
				// Si cambia con una versión de SvelteKit, app.css lo oculta igualmente.
				'style-src-attr': dev
					? ['unsafe-inline']
					: ['unsafe-hashes', 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'manifest-src': ['self'],
				'worker-src': ['self'],
				'frame-src': ['none'],
				'frame-ancestors': ['none'],
				'form-action': ['self'],
				'base-uri': ['self'],
				'object-src': ['none']
			}
		},
		// Comprueba cada 5 min si hay versión nueva para ofrecer «Actualizar».
		version: { pollInterval: 300_000 },
		alias: {
			$components: 'src/lib/components'
		}
	}
};

export default config;
