# ADR 0012 · Preparación del paso a VPS (fase 8)

- Estado: aceptada (28/10/2026)
- Contexto: plan 11.2 y criterio de la fase 8: «restauración de copia probada; DNS cambiado». Aún no hay servidor: se deja todo preparado y probado en local; contratar el VPS y cambiar el DNS quedan para la persona titular (docs/VPS.md).

## Decisiones

- **Imagen** `node:22-alpine` en varias etapas.
  - La final lleva solo el servidor de `adapter-node`, las dependencias de producción y las migraciones SQL, y corre con un usuario sin privilegios y `tini`.
  - Al arrancar aplica las migraciones (`docker/migrate.mjs`, sin tsx) y Docker comprueba `/salud`, que responde 200 si llega a Postgres.
  - npm instala como «peer» de better-auth herramientas de compilación (vite, vitest, typescript, drizzle-kit) que no se usan al ejecutar. Se borran en la etapa final y la imagen baja de 603 a 482 MB.
  - La etapa `herramientas` (fuente y dependencias completas) sirve para el seed y para invitar al primer administrador.
- **Compose**: `app`, `db` (Postgres 16) y `caddy` (TLS automático, HTTP/3, compresión, 60 MB por petición para los PDF).
  - La app lee la IP y el protocolo de las cabeceras de Caddy (`ADDRESS_HEADER`, `PROTOCOL_HEADER`, `XFF_DEPTH=1`).
  - Las cabeceras de seguridad las sigue poniendo la aplicación.
- **Ficheros en disco** (volumen `ficheros`) por defecto, y S3 del proveedor como alternativa.
  - El plan proponía MinIO, pero su edición comunitaria ya no publica imágenes mantenidas.
  - Un disco local no añade otro servicio que vigilar y entra en la misma copia que la base de datos.
- **Copias**: `docker/copia.sh` hace `pg_dump` en formato custom y un tar de los ficheros, ambos cifrados con `openssl enc -aes-256-cbc -pbkdf2` (200.000 iteraciones). Guarda 30 días de retención local y las sube fuera con rclone si se configura un destino.
  - Se descartaron `age` y `gpg` porque no siempre vienen instalados; openssl sí.
- **Restauración probada** (28/10/2026, en local) con la imagen compilada:
  1. Seed dentro del contenedor, PDF de muestra incluidos (las páginas se convierten con `@napi-rs/canvas` sobre musl).
  2. Copia cifrada.
  3. Restauración en un proyecto de compose aparte y vacío.
  4. Salió lo mismo: 17 campañas, 5 usuarios, 68 versiones con páginas y 324 ficheros, con `/salud` en «ok».
- **Despliegue desde CI** solo en etiquetas de versión, como dice el plan, pero sin el flujo de Actions todavía: no hay servidor y no se quiere gastar cuota. Mientras tanto: `git checkout vX.Y.Z && docker compose up -d --build`.
