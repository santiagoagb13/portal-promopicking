# Portal de servicio Promopicking · Alsea (v2)

Portal para gestionar las campañas de material impreso de Foster's Hollywood, VIPS y Ginos: aprobación de artes finales, kits y trazabilidad, reposiciones, soporte e informes. El plan completo está en [`docs/PLAN-PORTAL-V2.md`](docs/PLAN-PORTAL-V2.md); las decisiones, en [`docs/adr/`](docs/adr/); las maquetas de diseño, en [`docs/propuestas/`](docs/propuestas/).

Estado: **fase 5 · QR y reposiciones** sobre las fases 1–4 ([ADR 0009](docs/adr/0009-fase-5-qr-y-reposiciones.md)): QR por versión y restaurante generados al aprobar, hoja y CSV para la imprenta, landing pública con reposición, aviso de error y retirada; catálogo con carrito, pedidos, validación de los del QR y avance a reparto. Fase 4 · Kits ([ADR 0008](docs/adr/0008-fase-4-kits.md)): generación de kits, trazabilidad, escaneo con pistola o cámara y cola sin cobertura, etiquetas A6 con QR, y recepción en el móvil con incidencia y foto. Fase 3 · Aprobaciones: Subida de PDF con conversión a imágenes, visor con exterior e interior, zoom, comparación y comentarios anclados, aprobar, pedir cambios y aprobar todas con registro, acta en PDF y avisos ([ADR 0007](docs/adr/0007-fase-3-aprobaciones.md)). Fase 2 (acceso por invitación con passkeys, carcasa, PWA). Hay panel con calendario, alta y detalle de campañas, maestro de restaurantes con edición, importación y descarga de Excel, y administración de usuarios, auditoría y ajustes. Decisiones en [ADR 0006](docs/adr/0006-fase-2-campanas-y-maestro.md).

## Pila

SvelteKit 2 + Svelte 5 + TypeScript estricto · Tailwind CSS v4 (propuesta de diseño B «Lámina») · PostgreSQL 16 + Drizzle ORM · Better Auth (passkeys y enlace mágico, sin contraseñas) · Vitest + Playwright · PWA con service worker propio. Despliegue en Vercel (`adapter-vercel`, `fra1`) y, más adelante, en un VPS con `adapter-node`.

## Arrancar en local

Requisitos: Node 22 o superior, Docker y npm.

```bash
npm install
cp .env.example .env            # y pon un AUTH_SECRET: openssl rand -base64 32
docker compose up -d --wait     # Postgres 16 en localhost:5433
npm run db:migrate              # aplica las migraciones
npm run db:seed                 # datos del prototipo, 5 usuarios y una invitación pendiente
npm run dev                     # http://localhost:5173
```

El seed lee el prototipo de `../portal/portal.html` (solo lectura; otra ruta con `PROTOTYPE_HTML`) y guarda una instantánea en `scripts/data/prototype.json`, que es la que se usa si el prototipo no está. Se puede relanzar cuando se quiera: deja los datos como al principio, conserva las passkeys de los usuarios de prueba y genera una invitación nueva.

### Entrar

Sin `MAIL_PROVIDER`, los correos no salen: se escriben en la consola del servidor y en `.mail/outbox.jsonl`.

- **Invitación de prueba** (Gerente · FH Gran Vía 48, la envía Jorge Martín): el enlace sale al final del `npm run db:seed` y en la bandeja. Ábrelo, confirma el nombre y pulsa «Crear passkey»: la cuenta se crea con la passkey y entras al Panel.
- **Usuarios de prueba** (entra con «Enviarme un enlace» y abre el enlace de la bandeja; después puedes registrar una passkey):

| Usuario      | Correo                              | Rol y ámbito                            |
| ------------ | ----------------------------------- | --------------------------------------- |
| Jorge Martín | `jorge.martin@promopicking.example` | Administración (Promopicking), todo     |
| Marta Ruiz   | `marta.ruiz@alsea.example`          | Marketing de marca · Foster's Hollywood |
| Carlos Vega  | `carlos.vega@alsea.example`         | Marketing de marca · VIPS               |
| Laura Pons   | `laura.pons@alsea.example`          | Marketing de marca · Ginos              |
| Ana Soler    | `ana.soler@fosters.example`         | Gerente · FH Plenilunio                 |

Las passkeys funcionan en `localhost` con Touch ID, Windows Hello, el gestor de contraseñas del navegador o una llave física. Las fechas relativas usan la fecha de referencia de los datos (`APP_REFERENCE_DATE=2026-10-22`); en producción se deja vacía.

## Scripts

| Script                                     | Qué hace                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                              | Servidor de desarrollo                                                                                                                                                                                       |
| `npm run check`                            | `svelte-check` (tipos de TS y Svelte)                                                                                                                                                                        |
| `npm run lint` / `npm run format`          | Prettier y ESLint / formatear                                                                                                                                                                                |
| `npm run test:unit`                        | Vitest: permisos, hitos y semáforo, códigos de versión, invitaciones, paridad con el prototipo                                                                                                               |
| `npm run test:integration`                 | Vitest contra Postgres: servicio de invitaciones (requiere BD con seed)                                                                                                                                      |
| `npm run test:e2e`                         | Playwright: compila, migra, hace el seed y prueba invitación → passkey (autenticador virtual de Chromium) → panel, seguridad y capturas a 375, 768, 1024 y 1440 px en claro y oscuro (`tests/e2e/capturas/`) |
| `npm run db:generate`                      | Genera una migración a partir de `schema.ts`                                                                                                                                                                 |
| `npm run db:migrate` / `npm run db:seed`   | Migraciones / datos de prueba                                                                                                                                                                                |
| `npm run seed:extract`                     | Solo regenera `scripts/data/prototype.json` desde el prototipo                                                                                                                                               |
| `npm run build` / `npm run build:node`     | Compilación para Vercel / para el VPS (`build/`, se arranca con `npm run start:node`)                                                                                                                        |
| `npm run invitar-admin -- correo "Nombre"` | Invitación del primer administrador en un entorno sin ninguno                                                                                                                                                |
| `npm run icons`                            | Regenera los iconos de la PWA                                                                                                                                                                                |

La primera vez, Playwright necesita su navegador: `npx playwright install chromium`. Husky ejecuta Prettier y ESLint sobre lo que se confirma en cada commit.

## Estructura

```
src/lib/server/      solo servidor: db (esquema, migraciones), auth (Better Auth, permisos en hooks),
                     services (campañas, invitaciones), mail (consola, Resend, SMTP), storage (fase 3)
src/lib/components/  ui/ (botón, chip, tabla, diálogo, aviso…), domain/ (semáforo, chip de marca…), shell/
src/lib/domain/      lógica pura compartida: hitos, fases, progreso, semáforo, códigos de versión, fechas
src/lib/permissions.ts  can(usuario, acción, recurso) con la matriz de 4.2
src/routes/(auth)/   acceso, «revisa tu correo», invitación
src/routes/(app)/    todo lo que exige sesión: campañas, cuenta, admin/invitaciones y las demás secciones
src/hooks.server.ts  sesión, guardas por sección, límite de intentos, cabeceras de seguridad
scripts/             seed desde el prototipo, migraciones, iconos
tests/               unit/, integration/, e2e/
```

## Seguridad (resumen)

Sin contraseñas ni registro abierto: solo se entra por invitación (token de 256 bits; en la BD solo su SHA-256) y después con passkey o enlace mágico de 10 minutos. Sesiones en Postgres con cookies `HttpOnly`, `SameSite=Lax` y `Secure` en https; 12 h de inactividad, 30 días como máximo y 8 h para administración. CSP con nonce y sin `unsafe-inline`, `frame-ancestors 'none'`, HSTS en https y `Cache-Control: private, no-store` en todo lo que lleva sesión. Límite de intentos por IP y por correo. Registro de auditoría inmutable. Detalle en [ADR 0002](docs/adr/0002-better-auth.md).

## Publicar en Vercel (pasos para la persona titular)

Nada de esto está hecho: no hay proyecto en Vercel, ni base de datos en Neon, ni dominio en Resend.

1. **Repositorio**: sube este repositorio a GitHub (privado).
2. **Vercel**: _Add New › Project_, importa el repositorio. Framework: SvelteKit (lo detecta). No cambies los comandos: Vercel usa el script `vercel-build`, que aplica las migraciones, carga el seed solo en las previsualizaciones (`VERCEL_ENV=preview`) y compila. La región `fra1` y Node 22 ya vienen en `svelte.config.js`.
3. **Base de datos**: en _Storage_ (o en neon.tech) crea una base Neon Postgres en Fráncfort y conéctala al proyecto. Usa la cadena _pooled_ como `DATABASE_URL` y pon `DATABASE_POOL_MAX=5`. Si activas una rama de Neon por previsualización, cada PR tendrá sus datos de prueba.
4. **Variables de entorno** (_Settings › Environment Variables_), por entorno:
   - `AUTH_SECRET`: distinto en _Production_ y _Preview_ (`openssl rand -base64 32`).
   - `AUTH_ORIGIN`: `https://portal.tudominio.com` en producción. En previsualización, la URL fija de la rama o el dominio de previsualización (las passkeys quedan ligadas a ese dominio: no se pueden compartir entre dominios).
   - `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` (de un dominio verificado en Resend con SPF y DKIM).
   - `APP_REFERENCE_DATE=2026-10-22` solo en _Preview_ (para que los datos de prueba cuadren); vacía en producción.
   - No definas nunca `PORTAL_ENTORNO` en Vercel.
5. **Correo**: crea la cuenta de Resend, verifica el dominio remitente (registros DNS) y genera la clave.
6. **Ficheros** (artes finales): Vercel no tiene disco persistente. Crea un bucket en un servicio compatible con S3 (por ejemplo, Cloudflare R2), con una clave de acceso limitada a ese bucket y una regla CORS que permita `PUT` y `GET` desde el dominio del portal. Define `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_KEY` y `S3_SECRET` también en _Preview_: el origen del endpoint entra en la CSP al compilar.
7. **Dominio**: añade `portal.tudominio.com` en _Settings › Domains_ y crea el CNAME que indique Vercel. Mientras tanto, activa _Deployment Protection_ para las previsualizaciones `*.vercel.app`.
8. **Primer administrador en producción**: el seed no se ejecuta en producción. Con la `DATABASE_URL` de producción en el entorno (y `AUTH_ORIGIN` y el correo configurados), ejecuta una vez `npm run invitar-admin -- tu@correo.com "Tu nombre"`: envía la invitación de administración (con `--sin-correo` solo muestra el enlace). Solo funciona mientras no haya ningún administrador; después, las invitaciones salen del portal (Administración › Invitaciones).
9. **CI**: el workflow `.github/workflows/ci.yml` se ejecuta en cada PR (solo `ubuntu-latest`, con la cuota de la cuenta en mente). El despliegue lo hace la integración Git de Vercel, que no gasta minutos de Actions.

Para el VPS (fase 8): `npm run build:node` genera `build/`, que se arranca con `node build` detrás de Caddy, con las mismas variables de entorno. Con almacenamiento local en el disco del VPS pon `BODY_SIZE_LIMIT=60M`: la subida de artes pasa entonces por el propio servidor.
