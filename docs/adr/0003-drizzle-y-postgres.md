# ADR 0003 · Drizzle ORM sobre PostgreSQL 16

- Estado: aceptada (fase 1, 27/10/2026)
- Contexto: secciones 3.3, 6 y 9.3 del plan.

## Decisión

PostgreSQL 16 con Drizzle ORM y drizzle-kit. El esquema vive en `src/lib/server/db/schema.ts`; las migraciones SQL, versionadas, en `src/lib/server/db/migrations/` (`npm run db:generate` las crea, `npm run db:migrate` las aplica).

- Tipado desde el esquema, SQL visible y sin motor binario (frente a Prisma).
- Índices de 9.3: `campaigns(brand_code, in_restaurant_on)`, `kits(campaign_id, state)`, `support_versions(support_id, status)`, `tickets(state, opened_at)`, `audit_log(user_id, at)`, más los de claves ajenas habituales.
- `audit_log` es inmutable: una migración propia (`0001_auditoria_inmutable.sql`) añade disparadores que rechazan `UPDATE`, `DELETE` y `TRUNCATE`. No tiene clave ajena a `users` para que borrar una cuenta no toque el registro.

## Desviaciones

1. **Un solo controlador, `pg` con pool, también en Vercel.** El plan proponía el driver serverless de Neon en Vercel. Con funciones Node (no edge) y la cadena _pooled_ de Neon, `pg` funciona igual y evita dos caminos de código; `DATABASE_POOL_MAX` limita las conexiones por instancia. Si la latencia de arranque en frío lo pidiera, se puede cambiar a `drizzle-orm/neon-serverless` en `db/client.ts` sin tocar nada más.
2. **Columnas añadidas al modelo de la sección 6**, todas para no perder datos del prototipo: `users.organization`, `campaigns.materials` y `notes`, `supports.position`, `versions_planned`, `packaging`, `responsible`, `notes` y los datos del juego de artes (`artwork_format`, `artwork_label`, `artwork_prev_label`), `support_versions.tariff/assortment/language/variant/uploaded_by`, `version_comments.author_label`, `kit_lines.label`, `kit_events.by_label`, `tickets.opened_by_label`, `ticket_updates.author_label`, `notifications.title/href`, `passkeys.last_used_at` e `invitations.name/sent_at/used_by_user_id/revoked_by`. Las etiquetas de texto guardan autores que no son usuarios del portal (p. ej. «Plataforma Promopicking · ruta 14»).
3. **Tabla `rate_limits`** para el límite de intentos (ADR 0002).
4. **Vistas de informes** (`v_otif_monthly`…): llegan con los informes en la fase 6. Los datos fijos de `REPORTS` del prototipo se conservan en la instantánea `scripts/data/prototype.json` para entonces.

## Seed

`scripts/seed-from-prototype.ts` (6.1) extrae del prototipo las constantes y las funciones que generan datos (`calDates`, `supportsOf`, `mkVersions`, `kitsOf`…), las evalúa con `node:vm` y guarda el resultado en `scripts/data/prototype.json`. Si el prototipo no está (CI, Vercel), usa esa instantánea. Es idempotente: vacía y recarga los datos de dominio, hace upsert de marcas, restaurantes y de los 5 usuarios de prueba (conservan sus passkeys) y regenera la invitación pendiente.
