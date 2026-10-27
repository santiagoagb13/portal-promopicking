# ADR 0007 · Decisiones de la fase 3 (aprobación de artes finales)

- Estado: aceptada (27/10/2026)
- Contexto: secciones 3.3, 4.3, 8.5 y 8.14 del plan; criterio de la fase: «Marta aprueba desde el iPad y Jorge recibe el aviso».

## Ficheros

- **Dos adaptadores con la misma interfaz** (`src/lib/server/storage`):
  - `local`: disco, en desarrollo, en las pruebas o en el VPS con disco propio. Las URL apuntan a `/archivos/<clave>`, con firma HMAC y caducidad, y además piden sesión.
  - `s3`: cualquier servicio compatible (AWS S3, Cloudflare R2, Hetzner, MinIO), con URL prefirmadas SigV4 mediante `aws4fetch`.
- **Desviación: no hay adaptador de Vercel Blob.** El plan proponía Blob en Vercel y S3 en el VPS. Con un único adaptador S3 se usa el mismo código en los dos sitios y se evita una segunda vía sin probar. En Vercel hay que configurar un almacenamiento compatible con S3 (por ejemplo, R2, que no cobra la salida de datos). Los pasos están en el README.
- **Subida directa**: el navegador sube cada PDF con una URL firmada de PUT. Los ficheros no pasan por la función, que en Vercel no admite cuerpos de más de 4,5 MB, y el límite del plan son 50 MB. Sin JavaScript hay una vía alternativa: el formulario envía los ficheros al servidor (en el VPS conviene `BODY_SIZE_LIMIT=60M`).
- **CSP**: con `STORAGE_PROVIDER=s3`, el origen de `S3_ENDPOINT` se añade a `img-src` y a `connect-src` al compilar.
- **Validación**: tipo real por la firma `%PDF-`, 50 MB como máximo, nombre de fichero regenerado (`subidas/<subida>/<id>.pdf`) y SHA-256 del contenido.

## Conversión a imágenes

- **pdf.js (`pdfjs-dist`) con `@napi-rs/canvas`**, en lugar de `pdftoppm` y `sharp`. No necesita binarios del sistema (en Vercel no hay poppler) y `sharp` no rasteriza PDF.
- Cada página se guarda en WebP a 800 y 1600 px para el `srcset` del visor; se convierten como máximo 24 páginas por fichero.
- La conversión se hace al publicar, dentro de la petición: unos 0,3 s por página. Para lotes grandes en Vercel puede hacer falta subir `maxDuration` o pasarla a segundo plano; queda para cuando haya artes reales.

## Versiones y revisiones

- Cada PDF publicado es una fila nueva en `support_versions`. Si el código ya existía, la nueva es la revisión siguiente (`prev_version_id` apunta a la anterior) y la anterior queda marcada como sustituida (`superseded_at`). Las listas, los KPI y los contadores solo cuentan las vigentes.
- **Código de versión desde el nombre del fichero** (`parseArtworkFilename`), con la convención del prototipo: `FH-01_C2-RED+-SP_v2.pdf` → C2 RED+ SP, revisión 2. Si coincide con un código existente se usa ese código tal cual. Se confirma en una tabla antes de publicar.
- **Comparar** muestra la revisión anterior y la actual lado a lado, una de las dos opciones del plan. El deslizador exigiría estilos en línea, que la CSP no admite.

## Decisiones

- **Registro**: `version_decisions` guarda quién, cuándo, qué decisión, la revisión, la huella del fichero y el agente de usuario (del que sale el dispositivo, p. ej. «iPad · Safari»). Además se escribe en la auditoría.
- **Aprobar** pide confirmación y ofrece «Deshacer» durante 8 s; el servidor lo acepta durante 30 s y solo a quien aprobó. **Pedir cambios** exige comentario, que pasa al hilo. **Reabrir** vuelve a pendiente.
- **Aprobar todas** aprueba solo las pendientes; las que tienen cambios pedidos quedan fuera y el diálogo lo dice.
- **Fase del soporte**:
  - con todas sus versiones vigentes aprobadas, pasa a «En producción»;
  - si se reabre alguna, vuelve a «En aprobación»;
  - al publicar artes, pasa a «En aprobación».

## Avisos (8.14)

- Al publicar se avisa al marketing de la marca.
- Al decidir o comentar marketing, se avisa a quien subió y a Operaciones.
- Al comentar Promopicking, se avisa a la marca.
- Por ahora los avisos están solo en la campana. El correo con resumen diario a las 9:00 necesita un cron (Vercel Cron o el del VPS) y queda para cuando el correo real esté configurado.

## Seed

Por cada versión del prototipo se genera un PDF de muestra (con `pdf-lib`) que pasa por la misma conversión que los reales. Las páginas ya convertidas se reutilizan entre seeds. C2 RED+ SP trae además su revisión 1 sustituida, para poder probar la comparación.

## Pendiente

- **Presupuesto de JS (9.2)**: con la carcasa completa, las rutas de aprobación (62,5 KB), maestro (61) y detalle de campaña (64) pasan de los 60 KB del plan; el panel de campañas está en 58. Se ajusta en la fase 7 (rendimiento), por ejemplo cargando los paneles laterales al abrirlos, como en el panel.
- **Acta en PDF**: tabla con versiones, revisión, estado, quién y cuándo, dispositivo y huella. Usa las fuentes estándar de PDF, así que los caracteres que no caben en WinAnsi se sustituyen.
