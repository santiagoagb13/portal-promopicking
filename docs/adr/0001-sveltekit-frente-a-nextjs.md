# ADR 0001 · SvelteKit 2 frente a Next.js

- Estado: aceptada (fase 1, 27/10/2026)
- Contexto: sección 3 del plan.

## Contexto

El portal tiene que llegar renderizado desde el servidor, enviar poco JavaScript (60 KB comprimidos por ruta como máximo), funcionar con formularios sin JS en almacenes con mala cobertura y poder pasar de Vercel a un VPS sin reescribir nada.

## Decisión

SvelteKit 2 con Svelte 5 (runas) y TypeScript estricto.

- SSR y form actions nativas: cada mutación es un `<form method="POST">` que funciona sin JS y que `use:enhance` mejora.
- Poco JS: la ruta del Panel de campañas carga 56 KB gzip con la carcasa completa (lo mide `tests/e2e/panel.spec.ts`).
- Portabilidad: `adapter-vercel` (región `fra1`, funciones Node 22) por defecto y `adapter-node` con `ADAPTER=node` para el VPS. Mismo código, cambia el adaptador y las variables.

## Alternativas

- **Next.js (App Router)**: más ecosistema y perfiles React, pero 80–120 KB por página, Server Actions que exigen React en cliente y un despliegue en VPS más pesado.
- **Astro + islas**: casi cero JS, pero pensado para contenido; el visor, el escaneo y el carrito serían islas grandes.

## Consecuencias

- Al implementar (octubre de 2026) ya existe SvelteKit 3. El plan fija SvelteKit 2 y se usa la última 2.x (2.70); pasar a la 3 es una decisión aparte cuando el ecosistema (adaptadores, Better Auth) la soporte sin fricción.
- `vite preview` sirve la compilación de producción con cualquier adaptador; las pruebas E2E la usan.
