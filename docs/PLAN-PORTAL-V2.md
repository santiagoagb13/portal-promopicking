# Portal de servicio Promopicking · Alsea — Plan de la versión 2

Documento de trabajo para reconstruir el portal desde cero, en una carpeta nueva con su propio repositorio Git. Aquí no se implementa nada: se recoge lo que hay, lo que queremos y cómo lo vamos a hacer, con las decisiones que quedan por tomar marcadas como tales.

Fecha: 27/10/2026 · Origen: prototipo `portal.html` + acceso PHP de la carpeta `portal/`.

---

## 1. Resumen

| | Hoy (prototipo) | Versión 2 |
|---|---|---|
| Tecnología | Un HTML de 155 KB con todo el JS y los datos en memoria; acceso con PHP y un `usuarios.txt` | Aplicación SSR en TypeScript, base de datos Postgres, PWA instalable |
| Acceso | Usuario + contraseña compartidos por empresa (3 cuentas) | Invitación personal por correo, passkeys (Face ID / Touch ID / Windows Hello), enlace mágico de respaldo, roles y ámbito por marca o restaurante |
| Diseño | Panel genérico, párrafos explicativos bajo cada título, botones con texto | Minimalista, iconos con color semántico, confirmación de acciones relevantes, sin radios redondeados, modo oscuro |
| Datos | Ficticios, se pierden al recargar | Persistentes; los datos actuales sirven para poblar el entorno de pruebas |
| Despliegue | Carpeta dentro del WordPress de la agencia | Vercel ahora, VPS propio después, sin cambiar código |

Objetivos en orden de prioridad: **seguridad · rapidez · claridad · mantenibilidad**.

---

## 2. Lo que tenemos: dominio extraído del prototipo

Esto es lo que la versión 2 tiene que cubrir como mínimo. Se extrae del código actual, no de supuestos.

### 2.1 Actores

| Perfil (hoy) | Organización | Qué hace |
|---|---|---|
| Marketing de marca (Marta Ruiz FH, Carlos Vega VIPS, Laura Pons Ginos) | Alsea | Aprueba artes finales, sigue campañas, consulta informes, abre consultas |
| Operaciones (Jorge Martín) | Promopicking | Sube artes finales, gestiona kits, escanea en plataforma, responde incidencias, mantiene el maestro |
| Gerente de restaurante (Ana Soler · FH Plenilunio) | Restaurante | Confirma recepción desde el móvil, abre incidencias con foto, pide reposiciones, escanea QR de versión |
| Producción (Albatros Comunicación) | Albatros | Kitting, etiquetado y expedición |

### 2.2 Entidades y sus datos

| Entidad | Campos relevantes hoy | Volumen de muestra |
|---|---|---|
| Marca | código (FH, VIPS, GINOS), nombre, nº restaurantes (205 / 170 / 114) | 3 |
| Restaurante | código (`FH-0147`), marca, nombre, ciudad, dirección, tarifa (C1…C3+, WARNER), idioma (SP, EN, CAT, FR, GALL…), surtido (ALL, RED, RED+), fachada, punto de entrega | 42 (de 489 reales) |
| Campaña | código (`FH-26-06`), marca, nombre, fecha en restaurante, nº restaurantes, fase (0–6), responsable, materiales, líneas de kit | 17 |
| Soporte de campaña | nombre, nº versiones, tirada, unidades por kit, fase propia | 2–8 por campaña |
| Hitos de calendario | brief, artes finales, límite de aprobación, inicio/fin producción, kitting, expedición, plataforma, en restaurante (se calculan hacia atrás desde la fecha en restaurante) | 9 por campaña |
| Juego de artes finales | campaña, soporte, formato (tríptico / página), etiqueta de versión (`11/2026`), anterior, subido por | 6 |
| Versión de arte final | código (`C2 ALL SP` = tarifa · surtido · idioma), nº kits que la reciben, estado (pendiente / aprobada / cambios), revisión, quién y cuándo, comentarios, fichero PDF y tamaño | 5–20 por juego |
| Kit | id (`K-GI2607-0231`), restaurante, campaña, nº bultos, estado (Preparado → Expedido → En plataforma → En reparto → Recibido), escaneos (fecha, qué, quién), incidencia asociada, recibido por | 1 por restaurante y campaña |
| Etiqueta de bulto | kit, bulto n/N, restaurante y dirección, contenido por versión, QR | 1 por bulto |
| QR de versión | soporte + versión + lote; al escanear: vigente o sustituida → reponer, avisar de error, marcar retirada | 1 por pieza impresa |
| Artículo de catálogo | categoría (genérico / LSM), marca o todas, nombre, descripción técnica, unidad de venta, precio, plazo de entrega en días | 20 |
| Pedido de reposición | id (`REP-2026-0311`), restaurante, fecha, líneas, estado (En preparación / En reparto / Entregado) | 5 |
| Ticket | id (`INC-` / `CON-`), campaña, tipo (incidencia / consulta), motivo (faltan unidades, bulto dañado, retraso, versión incorrecta, otros), título, severidad, estado (Abierta / En curso / Respondida / Cerrada), restaurante, actualizaciones | 7 |
| Informe | OTIF mensual, consumo por marca, incidencias por tipo, tiempo medio de aprobación por marca, top soportes, top reposiciones | 12 meses |

### 2.3 Pantallas y acciones que existen hoy

| Pantalla | Acciones del usuario | Cambios relevantes (hoy sin confirmación) |
|---|---|---|
| Panel de campañas | filtrar por marca, abrir campaña, nueva campaña | — |
| Detalle de campaña | ver fases, soportes, ir a aprobación / kits, abrir consulta | — |
| Aprobación de artes finales | elegir soporte y versión, ver exterior/interior, comparar con la anterior, aprobar, pedir cambios, aprobar todas las pendientes, reabrir, comentar | aprobar, aprobar todas, pedir cambios, reabrir |
| Kits y etiquetas | elegir campaña y kit, ver trazabilidad, escanear siguiente paso, imprimir etiquetas, simular recepción móvil con foto, abrir incidencia | escaneos, confirmar recepción, enviar incidencia |
| QR de versión | simular carta vigente / antigua, pedir reposición, avisar de error, marcar retirada | pedir reposición, avisar de error |
| Reposiciones | elegir restaurante, filtrar catálogo, añadir al carrito, cambiar cantidades, enviar pedido, ver pedidos | enviar pedido |
| Informes | filtrar por marca, exportar | — |
| Maestro de restaurantes | filtrar, buscar, editar ficha, importar Excel, alta | guardar ficha, importar |
| Soporte e incidencias | filtrar, abrir ticket, responder, cerrar, crear | cerrar ticket |

### 2.4 Carencias del prototipo que la v2 resuelve

- Sin persistencia ni concurrencia: todo vive en memoria del navegador.
- Sin permisos: cualquier cuenta ve y hace todo; el perfil es un desplegable.
- Cuentas compartidas por empresa, sin trazabilidad real de quién aprobó qué.
- Sin ficheros reales (los PDF son nombres), sin fotos reales, sin impresión real de etiquetas.
- Sin notificaciones: nadie sabe que tiene versiones pendientes salvo entrando.
- Texto explicativo en cada pantalla, botones largos, pantalla de informes con gráficos poco legibles en móvil.
- El escaneo de kits es un botón; en producción será una cámara o una pistola de códigos.

---

## 3. Tecnología

### 3.1 Criterios

- **SSR real**: cada página llega renderizada desde el servidor; el JavaScript del cliente solo mejora lo que ya funciona (formularios que funcionan sin JS).
- **Poco JavaScript**: presupuesto de 60 KB comprimidos por ruta; los gráficos se dibujan en el servidor como SVG.
- **Un solo lenguaje** (TypeScript) de extremo a extremo, con validación de esquemas compartida.
- **Sin dependencia del proveedor**: lo mismo corre en Vercel y en un VPS cambiando un adaptador y variables de entorno.
- **Seguridad por defecto**: sesiones en servidor, cookies `HttpOnly`, CSP estricta, sin secretos en el cliente.

### 3.2 Comparativa de frameworks

| | SvelteKit 2 + Svelte 5 | Next.js (App Router) | Astro + islas |
|---|---|---|---|
| JS enviado por página típica | 10–25 KB | 80–120 KB | 0–10 KB |
| SSR + formularios sin JS | Nativo (form actions, `use:enhance`) | Server Actions (requieren React en cliente) | Form actions básicas |
| Aplicación interactiva (visor, carrito, escaneo) | Muy buena | Muy buena | Regular: pensado para contenido, no para apps |
| Despliegue en Vercel | adapter-vercel | Nativo (es su casa) | Adaptador |
| Despliegue en VPS | adapter-node, un proceso Node | Posible pero pesado (standalone build, más memoria) | adapter-node |
| Curva de aprendizaje | Baja | Media-alta (RSC, cachés) | Baja |
| Ecosistema | Suficiente para todo lo que necesitamos | El mayor | Centrado en contenido |

**Recomendación: SvelteKit 2 con Svelte 5.** Es el que mejor cumple SSR + poco JS + portabilidad a VPS, y el único de los tres donde los formularios funcionan sin JavaScript sin esfuerzo extra, lo que importa en un almacén con cobertura mala. Next.js es la alternativa si se prefiere contratar perfiles React.

### 3.3 Pila completa propuesta

| Capa | Elección | Alternativa | Por qué |
|---|---|---|---|
| Framework | SvelteKit 2 + Svelte 5 + TypeScript estricto | Next.js 15 | Ver 3.2 |
| Estilos | Tailwind CSS v4 con tokens propios (`@theme`) | CSS propio con capas | Rápido de iterar, tokens en un sitio, purgado automático |
| Base de datos | PostgreSQL 16 | — | Estándar, transacciones, JSON cuando haga falta, mismo motor en Vercel (Neon) y en VPS |
| ORM / migraciones | Drizzle ORM + drizzle-kit | Prisma | Tipado desde el esquema, SQL visible, migraciones versionadas, sin motor binario |
| Validación | Zod (esquemas compartidos cliente-servidor) | Valibot | Un esquema por formulario, errores tipados |
| Autenticación | Better Auth: passkeys, enlace mágico, sesiones en BD, límite de intentos | Implementación propia siguiendo la guía de Lucia con Oslo | Cubre invitaciones, passkeys y 2FA con código auditado; sin proveedor externo |
| Correo transaccional | Resend (invitaciones, enlaces mágicos, avisos) | SMTP propio en el VPS | API simple, dominio verificado con SPF/DKIM |
| Ficheros (PDF, fotos, etiquetas) | Vercel Blob ahora → S3 compatible (MinIO o Hetzner Object Storage) en el VPS | — | Interfaz de almacenamiento abstraída desde el día 1 |
| PDF de artes finales | Al subir: se convierten las páginas a WebP con `pdftoppm`/`sharp` para el visor; el PDF original solo se descarga | pdf.js en el cliente | El visor no carga ninguna librería; la comparación entre versiones es comparar dos imágenes |
| Códigos QR | `qrcode` en servidor (SVG) | — | Igual que hoy pero sin código propio |
| Lectura de códigos | `BarcodeDetector` nativo + `zxing-wasm` de respaldo, cargado solo en la ruta de escaneo | — | Cámara del móvil y pistolas USB (que escriben como teclado) |
| Gráficos | SVG generado en servidor con utilidades de D3 (`d3-scale`, `d3-shape`) | LayerChart | Cero JS para ver un informe |
| Iconos | Lucide (trazo 1.5 px, 20 px) | Phosphor | Juego completo, coherente, árbol de iconos purgado |
| PWA | `@vite-pwa/sveltekit` (Workbox) | Service worker propio de SvelteKit | Manifest, caché de la carcasa, cola en segundo plano para escaneos sin cobertura |
| Pruebas | Vitest (unidad e integración con BD en Docker) + Playwright (extremo a extremo) | — | Playwright también sirve para las capturas por resolución que hemos hecho a mano |
| Calidad | ESLint + Prettier + `svelte-check` + Husky pre-commit | Biome | Convencional |
| Observabilidad | Sentry (errores) + logs estructurados (pino) | GlitchTip autoalojado en el VPS | Saber qué falla antes de que avisen |
| Despliegue | Vercel (integración Git) → VPS con Docker Compose + Caddy | — | Ver sección 11 |

### 3.4 Estructura del repositorio

```
portal-promopicking/
├── src/
│   ├── lib/
│   │   ├── server/          # solo servidor: db, auth, storage, mail, pdf, qr
│   │   │   ├── db/          # schema.ts (Drizzle), migrations/, seed/
│   │   │   ├── auth/        # configuración Better Auth, permisos, ámbito
│   │   │   ├── storage/     # interfaz + adaptadores (vercel-blob, s3)
│   │   │   └── services/    # lógica de dominio: campañas, aprobaciones, kits…
│   │   ├── components/      # ui/ (botón, icono, diálogo, tabla…), domain/ (chip de fase, semáforo…)
│   │   ├── schemas/         # Zod compartidos
│   │   └── i18n/            # textos (es por defecto; preparado para ca/en)
│   ├── routes/
│   │   ├── (auth)/          # acceso, invitación, enlace mágico
│   │   ├── (app)/           # todo lo que requiere sesión, con layout de aplicación
│   │   │   ├── campanas/ aprobaciones/ kits/ reposiciones/ informes/ maestro/ soporte/ admin/ cuenta/
│   │   ├── (public)/qr/[codigo]/   # landing pública del QR de versión, sin sesión
│   │   ├── api/             # webhooks y endpoints para pistolas/escáner, autenticados por token
│   │   └── +layout.server.ts
│   ├── service-worker.ts
│   └── hooks.server.ts      # sesión, cabeceras de seguridad, CSP, rate limit
├── static/                  # manifest, iconos PWA, fuentes
├── tests/                   # e2e/ (Playwright), unit/ (Vitest)
├── scripts/                 # seed desde el prototipo, backups
├── docker/                  # Dockerfile, compose.yml, Caddyfile (fase VPS)
├── .github/workflows/ci.yml
└── docs/                    # este plan, decisiones (ADR), guía de diseño
```

---

## 4. Arquitectura

### 4.1 Renderizado y datos

- Cada ruta tiene `+page.server.ts` que carga los datos con el usuario ya resuelto; nada de llamadas a API desde el cliente para pintar la página inicial.
- Mutaciones mediante **form actions**: un `<form method="POST">` por acción. Funcionan sin JS; con JS, `use:enhance` evita la recarga y muestra el resultado en sitio.
- Estado del cliente mínimo: carrito, selección del visor, cola de escaneos sin cobertura. Todo lo demás vive en la URL (`?marca=FH&estado=pendiente`) para que sea compartible y vuelva igual al recargar.
- Streaming de datos lentos (informes) con `await` diferido: el esqueleto llega al instante.
- Invalidación precisa (`depends('app:kits')`) para refrescar solo lo que cambió tras una acción.

### 4.2 Permisos

Un único módulo `can(usuario, acción, recurso)` usado en el servidor en cada carga y acción, y en el cliente solo para ocultar lo que no se puede hacer. Nunca se confía en el cliente.

| Acción | Admin (Promopicking) | Operaciones (Promopicking) | Producción (Albatros) | Marca (Alsea, por marca) | Gerente (por restaurante) |
|---|---|---|---|---|---|
| Ver campañas e informes | todas | todas | todas | de su marca | las que afectan a su restaurante |
| Crear / editar campañas | ✓ | ✓ | — | — | — |
| Subir artes finales | ✓ | ✓ | ✓ | — | — |
| Aprobar / pedir cambios | — | — | — | ✓ de su marca | — |
| Escanear kits (expedición, plataforma, reparto) | ✓ | ✓ | ✓ expedición | — | — |
| Confirmar recepción, abrir incidencia | ✓ | ✓ | — | — | ✓ su restaurante |
| Pedir reposición | ✓ | ✓ | — | ✓ (en nombre de un restaurante) | ✓ su restaurante |
| Editar maestro de restaurantes | ✓ | ✓ | — | ✓ de su marca (campos acordados) | — |
| Responder / cerrar tickets | ✓ | ✓ | ✓ los suyos | ✓ los suyos | — |
| Invitar usuarios, cambiar roles | ✓ | — | — | ✓ gerentes de su marca | — |
| Ver auditoría | ✓ | — | — | — | — |

Ámbito: un usuario de marca tiene una o varias marcas; un gerente, uno o varios restaurantes. Se guarda en tablas de relación, no en el rol.

### 4.3 Seguridad

- Cookies de sesión `HttpOnly`, `Secure`, `SameSite=Lax`, rotación al autenticarse y al cambiar privilegios; caducidad 12 h de inactividad y 30 días absoluta (configurable por rol: 8 h para admin).
- CSP estricta con nonce por petición, sin `unsafe-inline`; `frame-ancestors 'none'`; HSTS; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` con cámara solo en `/kits/recepcion` y `/kits/escaneo`.
- CSRF: comprobación de origen en todas las form actions (SvelteKit lo hace por defecto) más token en el endpoint de escáner.
- Límite de intentos por IP y por cuenta en acceso, invitación y enlace mágico (p. ej. 5 por 15 min), con respuesta constante en tiempo para no revelar si el correo existe.
- Subidas: tipo real por firma del fichero, tamaño máximo (PDF 50 MB, foto 10 MB), nombre regenerado, antivirus opcional (ClamAV en el VPS), URLs firmadas con caducidad.
- Registro de auditoría inmutable (quién, qué, cuándo, desde dónde, antes/después) para aprobaciones, escaneos, cambios de maestro, invitaciones y roles.
- Secretos solo en variables de entorno; `.env.example` documentado; nada en el repositorio.
- Dependencias: `npm audit` en CI y Dependabot semanal, agrupado.
- RGPD: datos personales mínimos (nombre, correo, rol); borrado de cuenta que anonimiza la auditoría; aviso de privacidad en el acceso.

---

## 5. Acceso e invitaciones

### 5.1 Principios

- **No hay registro abierto ni contraseñas compartidas.** Solo se entra por invitación personal.
- **Passkeys primero.** El dispositivo (Face ID, Touch ID, Windows Hello, llave física) es la credencial; no hay contraseña que filtrar ni olvidar.
- **Enlace mágico como respaldo** para quien entra desde un dispositivo nuevo o no puede usar passkeys.
- **Contraseña: no existe.** Si en el futuro un cliente la exige, se añade con 2FA obligatorio.

### 5.2 Flujo de invitación

1. Un admin (o un usuario de marca, para gerentes de su marca) crea la invitación: correo, rol, ámbito (marcas / restaurantes), caducidad (7 días por defecto).
2. Se genera un token aleatorio de 256 bits; en la BD se guarda **solo su hash**. El correo lleva el enlace `https://…/invitacion/<token>`.
3. Al abrirlo: se comprueba hash, caducidad y que no se ha usado. Se muestra quién invita y a qué, el nombre a confirmar y un único botón: **Crear passkey**. Si el navegador no soporta passkeys, se ofrece «Recibir enlace de acceso» (enlace mágico) y se recomienda registrar una passkey después.
4. Al registrar la passkey se crea la cuenta, se marca la invitación como usada y se abre sesión. Todo en una transacción.
5. Invitaciones pendientes: lista en Administración con reenviar (nuevo token, el anterior se invalida) y revocar.

### 5.3 Acceso diario

- Pantalla de acceso con un solo campo (correo) y el botón **Entrar con passkey** (con autocompletado condicional de WebAuthn: el navegador ofrece la passkey sin teclear nada).
- «Enviarme un enlace» → correo con enlace de un solo uso, 10 minutos, hash en BD, sin indicar si el correo existe.
- Al entrar desde un dispositivo nuevo con enlace mágico, se propone registrar una passkey en ese dispositivo.
- Cuenta: ver y nombrar passkeys, eliminar, ver sesiones activas por dispositivo y cerrarlas, descargar sus datos.

### 5.4 Administración de usuarios

- Lista con rol, ámbito, último acceso, estado (activo / suspendido / invitado).
- Suspender (cierra todas sus sesiones al instante), cambiar rol y ámbito (confirmación), eliminar (confirmación con el nombre escrito).
- Auditoría filtrable por usuario, acción y fecha; exportable a CSV.

### 5.5 Landing pública del QR de versión

Es la única ruta sin sesión. Un código corto por pieza (`/qr/FH01-C2ALLSP-2609`) que no revela nada sensible: muestra si la versión es vigente y ofrece tres acciones. Para evitar abusos: límite por IP, los pedidos desde QR se crean como «pendiente de validar» hasta que Operaciones los confirme, y se registra el restaurante por el lote, no por quien escanea.

---

## 6. Modelo de datos

Tablas principales (nombres en inglés en el esquema, textos en español en la interfaz).

```
users              id, email (único), name, role, status, created_at, last_seen_at
user_brands        user_id, brand_code                 # ámbito de marca
user_restaurants   user_id, restaurant_id              # ámbito de restaurante
invitations        id, email, role, scope (json), token_hash, invited_by, expires_at, used_at, revoked_at
sessions, passkeys, verifications                     # las gestiona Better Auth
audit_log          id, at, user_id, action, entity, entity_id, before (json), after (json), ip, user_agent

brands             code (FH, VIPS, GINOS), name, short, restaurant_count
restaurants        id (FH-0147), brand_code, name, city, address, tariff, language, assortment, facade, delivery_point, active, updated_by, updated_at
campaigns          id (FH-26-06), brand_code, name, in_restaurant_on, restaurant_count, owner_user_id, planned, created_at
campaign_milestones campaign_id, key (brief, af, aprob, prod_ini, prod_fin, kitting, exped, plataforma, rte), due_on, done_at
supports           id, campaign_id, name, run_qty, per_kit_qty, stage
support_versions   id, support_id, code (C2 ALL SP), kits_count, status (pending/approved/changes), revision,
                   file_key, file_size, page_images (json), decided_by, decided_at, prev_version_id
version_comments   id, version_id, user_id, at, text, page, x, y   # comentario anclado opcional
kits               id (K-GI2607-0231), campaign_id, restaurant_id, parcels, state (0–4), incident_ticket_id, received_by, received_at
kit_lines          kit_id, support_id, version_code, qty
kit_events         id, kit_id, at, type (prepared, shipped, hub_in, out_for_delivery, received, incident), by_user_id, source (web, scanner, mobile, qr), photo_key
qr_codes           code, support_id, version_code, batch, printed_at, retired_at
catalog_items      id, category (generic, lsm), brand_code|null, name, description, unit, price_cents, lead_days, active
orders             id (REP-2026-0311), restaurant_id, placed_by, placed_at, state, source (web, qr), validated_by
order_lines        order_id, item_id, qty, unit_price_cents
tickets            id (INC-2041), campaign_id, restaurant_id|null, type, kind, title, severity, state, opened_by, opened_at, closed_at
ticket_updates     id, ticket_id, at, user_id, text, photo_key
notifications      id, user_id, kind, entity, entity_id, read_at, created_at
```

Los informes se calculan con vistas SQL (`v_otif_monthly`, `v_consumption_by_brand`, `v_incidents_by_kind`, `v_approval_lead_time`) y se cachean 10 minutos.

### 6.1 Datos de prueba desde el prototipo

Script `scripts/seed-from-prototype.ts`:

1. Extrae del `portal.html` actual los bloques `USERS`, `BRANDS`, `RTES`, `CAMPAIGNS`, `APPROVALS`, `TICKETS`, `CATALOG`, `ORDERS`, `REPORTS` y los evalúa en un contexto aislado (Node `vm`) para obtener JSON.
2. Normaliza: fechas ISO, precios en céntimos, códigos de versión descompuestos en tarifa · surtido · idioma, hitos calculados con la misma función `calDates` del prototipo.
3. Genera los kits con la misma lógica de muestra (patrón de estados por campaña) y sus eventos.
4. Crea 5 usuarios de prueba con los perfiles de la sección 2.1, cada uno con su ámbito, y una invitación pendiente de ejemplo.
5. Idempotente: se puede relanzar; se usa en local, en CI y en el entorno de previsualización de Vercel.

La fecha de referencia (22/10/2026) se guarda como constante del seed para que los «hace 3 días» cuadren en las pruebas; en producción se usa la fecha real.

---

## 7. Sistema de diseño

### 7.1 Principios

1. **Sin texto que no haga falta.** Ni párrafos bajo los títulos ni frases de ayuda permanentes. Lo que necesite explicación va en un icono `?` con tooltip o en una primera visita descartable.
2. **Acción = icono + color + tooltip.** El texto aparece solo en la acción principal de cada pantalla y en los diálogos de confirmación.
3. **El color significa algo.** No decora.

   | Color | Significado | Ejemplos |
   |---|---|---|
   | Verde | confirma, aprueba, completa | aprobar versión, confirmar recepción, cerrar ticket resuelto |
   | Ámbar | pide atención, devuelve, pausa | pedir cambios, marcar pendiente de validar, reabrir |
   | Rojo | destruye o no vuelve | eliminar, revocar invitación, suspender usuario, retirar carta |
   | Azul de marca (navy) | acción principal de creación o avance | nueva campaña, subir artes finales, enviar pedido, escanear |
   | Neutro | ver, editar, navegar, descargar | abrir, editar ficha, descargar PDF, filtrar |

4. **Toda acción con consecuencia se confirma.** Diálogo nativo (`<dialog>`) con: una frase con el objeto («¿Aprobar 4 versiones de Carta surtido FH?»), lo que ocurrirá en una línea si no es obvio, botón de la acción con su color y «Cancelar». Las acciones rojas sobre entidades con nombre exigen escribirlo. Las acciones de escaneo en móvil se confirman con una pantalla completa y vibración, no con un diálogo pequeño.
5. **Deshacer cuando sea posible.** Las acciones ámbar y algunas verdes ofrecen «Deshacer» en el aviso durante 8 s (p. ej. aprobar una versión) en vez de un diálogo previo, si la acción es reversible sin coste.
6. **Nada de radios grandes.** Radio 0 en tarjetas, tablas, diálogos e inputs; 2 px máximo en botones y chips. Sin sombras difusas, sin degradados, sin cristal. La jerarquía la dan las líneas de 1 px, el espacio y el peso tipográfico.
7. **Densidad útil.** Tablas de 36 px de alto por fila en escritorio; fichas en móvil (ya definido en el prototipo: una fila → una ficha, sin scroll lateral).
8. **Modo oscuro** real desde el principio (tokens, no filtros), siguiendo el sistema y conmutable.
9. **Accesible**: contraste AA mínimo, foco visible de 2 px, todo operable con teclado, iconos con `aria-label`, tamaños táctiles de 44 px en móvil.

### 7.2 Tokens comunes a las tres propuestas

```
Espaciado      4 · 8 · 12 · 16 · 24 · 32 · 48
Radios         0 (superficies) · 2 px (controles)
Líneas         1 px, color --line; 2 px para foco
Tipos de letra escala 12 · 13 · 14 · 16 · 20 · 24 · 32, números tabulares en datos
Iconos         Lucide 20 px (16 px en tablas), trazo 1.5
Anchos         sidebar 232 px · contenido máx. 1280 px · diálogo 480 px
Puntos de corte 480 · 768 · 1024 · 1280
Movimiento     150 ms para estados, 200 ms para paneles; respeta prefers-reduced-motion
```

### 7.3 Tres propuestas de diseño

Las tres comparten estructura, componentes y tokens de espaciado; cambian paleta, tipografía, textura y tono. Se elige una (o se mezclan dos aspectos concretos).

#### Propuesta A · «Taller»  — técnico, continuidad con el prototipo

- **Idea**: panel de operaciones. Todo es dato y estado; el color de marca se usa poco y el semáforo mucho.
- **Fondo** gris frío `#f4f5f7` · **superficie** `#ffffff` · **tinta** `#15181d` · **línea** `#d8dce3`
- **Navy** `#16365c` (acción principal, sidebar) · verde `#1f7a45` · ámbar `#a66a0f` · rojo `#b3261e` · azul info `#2458a6`
- **Oscuro**: fondo `#101418`, superficie `#171c22`, línea `#2a313a`
- **Tipografía**: Inter (interfaz) + JetBrains Mono para códigos, ids y cantidades (`FH-0147`, `K-GI2607-0231`)
- **Textura**: tablas con cabecera en mayúsculas de 11 px, zebra sutil, sidebar oscuro como hoy
- **Tono**: sobrio, de herramienta. Mínimo riesgo: el cliente reconoce lo que ya vio.
- **Encaja si**: lo usan sobre todo Operaciones y Producción, con pistolas y monitores grandes.
- **Riesgo**: puede sentirse «ERP».

#### Propuesta B · «Lámina» — minimalismo claro, editorial

- **Idea**: hoja blanca con poca tinta. La interfaz desaparece y queda el contenido; el color aparece únicamente en estados y acciones.
- **Fondo** `#ffffff` · **superficie** `#ffffff` con líneas `#e6e6e6` (sin tarjetas: secciones separadas por líneas horizontales) · **tinta** `#111111` · **texto secundario** `#6b6b6b`
- **Acento** negro para la acción principal; verde `#1a7f4b` · ámbar `#b7791f` · rojo `#c62828`; las marcas con un color propio discreto cada una (FH teja `#9a3b22`, VIPS azul `#1c4b8a`, Ginos verde `#2c6b3a`) solo en su chip
- **Oscuro**: `#0c0c0c` / `#141414`, líneas `#262626`
- **Tipografía**: Geist (interfaz, números tabulares) + Geist Mono para códigos; títulos de 24 px con peso 500, nunca negrita pesada
- **Textura**: sidebar claro, estrecho, solo iconos (se expande al pasar el ratón o en tablet); cabeceras de tabla en 12 px sin mayúsculas; mucho aire
- **Tono**: tranquilo, premium, muy legible en móvil.
- **Encaja si**: lo que más pesa es la percepción del cliente (Alsea) y el uso en móvil del gerente.
- **Riesgo**: en tablas muy densas (maestro, versiones) exige disciplina para no perder jerarquía.

#### Propuesta C · «Pliego» — cálido, papel y tinta

- **Idea**: el producto que se gestiona es papel impreso; la interfaz lo recuerda. Fondo hueso, tinta casi negra, un acento cobre, sin azul corporativo.
- **Fondo** `#f5f2ec` · **superficie** `#fbfaf7` · **línea** `#dcd6ca` · **tinta** `#1c1a17` · **secundario** `#6e675c`
- **Acento** cobre `#9c4a1f` (acción principal) · verde oliva `#4e6b2f` · ámbar `#a3720c` · rojo `#a4262c`
- **Oscuro**: carbón cálido `#171513` / `#1f1c19`, líneas `#35302a`, acento `#d08a5c`
- **Tipografía**: Instrument Sans (interfaz) + Fraunces (solo títulos y cifras grandes de los KPI) + IBM Plex Mono (códigos)
- **Textura**: tarjetas con borde 1 px y sin sombra; etiquetas de bulto y carta mock con el mismo lenguaje; iconos con trazo 1.25
- **Tono**: distinto, con personalidad; se nota que es un producto propio y no una plantilla.
- **Encaja si**: se quiere diferenciarse y la marca Promopicking se va a construir alrededor del portal.
- **Riesgo**: dos tipografías de Google Fonts (peso en la primera carga, se mitiga con `font-display: swap` y subconjuntos); el cobre debe comprobarse en contraste sobre hueso.

#### Comparativa rápida

| | A · Taller | B · Lámina | C · Pliego |
|---|---|---|---|
| Continuidad con hoy | alta | media | baja |
| Legibilidad en móvil | buena | muy buena | buena |
| Densidad en escritorio | muy alta | media | alta |
| Personalidad | baja | media | alta |
| Peso de fuentes | 1 familia + mono | 1 familia + mono | 2 familias + mono |
| Esfuerzo de implementación | menor | medio | mayor |

Para decidir, en la fase 0 se maquetan **dos pantallas por propuesta** (Panel de campañas y Aprobación de artes finales, escritorio y móvil) como páginas estáticas; nada de implementar las tres.

**Decisión (27/10/2026): propuesta B «Lámina»**, con las correcciones de la sección 7.5. Las maquetas de las tres y las notas de valoración están en `portal-promopicking/docs/propuestas/` (índice, seis páginas, 24 capturas y `NOTAS.md`). A se descarta por ser la más parecida al prototipo; C por la falta de tonos libres para estados y el peso de las fuentes.

### 7.5 Correcciones tras las maquetas (reglas definitivas para B)

Salen de `NOTAS.md`; pasan a ser reglas del sistema de diseño.

| Problema visto en la maqueta | Regla |
|---|---|
| El ámbar `#b7791f` no llega a AA como texto de 12 px | Dos ámbares: `#b7791f` solo para iconos y puntos; **`#8a5a10`** para texto de chips (≥ 4,5:1 sobre `#fbf3e3`). Mismo criterio en oscuro (`#f0b65a` icono · `#f6cf8a` texto sobre `#2a2215`). |
| Barra de progreso teñida con el color del semáforo: dos indicadores del mismo estado | La barra es **siempre neutra** (`#111` sobre `#e6e6e6`); el semáforo es el único color de estado de la fila |
| Chips de marca con color propio (teja, azul, verde) compiten con el semáforo | Chips de marca **neutros**: fondo `#f2f2f2`, texto `#111`, 12 px, 2 px de radio. La marca se distingue por el texto, no por el color |
| Sidebar de solo iconos ilegible sin pasar el ratón; contadores encima del icono | Sidebar de **72 px con icono y etiqueta de 11 px debajo**; contador en la esquina superior derecha del icono; en ≥ 1280 px puede expandirse a 232 px con etiqueta al lado. En el modo de 72 px las etiquetas son cortas, de una línea: Campañas · Aprobaciones · Kits · QR · Reposiciones · Informes · Maestro · Soporte |
| Filas de 44 px: 17 campañas no caben en 900 px | Filas de **40 px** en escritorio (36 px en tablas densas como versiones y maestro); 44 px solo en móvil |
| El acento negro desaparece en oscuro | Es la regla, no un fallo: **el acento es la tinta** (negro en claro, blanco en oscuro). Los únicos colores son los de estado |
| Tablet 768–1023 px: tabla de 7 columnas comprimida | En ese tramo las tablas anchas pasan a **fichas a dos columnas**; la tabla completa solo a partir de 1024 px |
| Cabecera del visor en móvil con cuatro acciones en dos filas | En móvil las acciones del visor van en una **barra inferior fija** de 56 px; la cabecera solo lleva volver y el código |
| Panel en móvil de 3 700 px con barra de progreso en cada ficha | Las fichas en móvil muestran el progreso como texto, el mismo porcentaje ponderado por soporte que en escritorio («64 %»), y sin barra; 8 campañas por página con «Ver más» |
| Título del diálogo partido en dos líneas en 480 px | Diálogos de 440 px con título de 18 px; por debajo de 480 px el título baja a 16 px y los márgenes a 16 px para que la frase quepa en una línea hasta 360 px |

El resto de la propuesta B queda como está: blanco, líneas de 1 px en lugar de tarjetas, Geist + Geist Mono, títulos de 24 px con peso 500, radio 0 y 2 px.

### 7.4 Componentes

| Componente | Notas |
|---|---|
| Botón | variantes: principal, neutro, verde, ámbar, rojo, fantasma; tamaños 32 / 36 / 44 px; versión solo icono con tooltip obligatorio |
| Icono de acción | botón de 36 px solo icono; color según semántica; `aria-label` |
| Chip de estado | rectangular, 2 px, texto 12 px, color de fondo tenue + texto fuerte; un solo juego para fases, estados de kit, tickets y pedidos |
| Semáforo | punto 10 px + tooltip con el motivo |
| Tabla | ordenable, cabecera fija, selección múltiple con acciones en lote, fichas en móvil |
| Ficha (móvil) | título, subtítulo, pares etiqueta-valor, acciones a la derecha |
| Diálogo de confirmación | `<dialog>`, título como pregunta, acción coloreada, cancelar, soporte de «escribe el nombre» |
| Aviso (toast) | 1 línea, ≤ 6 palabras, icono, opcional «Deshacer», 5 s |
| Barra de filtros | segmentos + buscador; estado en la URL |
| Stepper de fases | horizontal en escritorio, vertical en móvil, fecha por fase |
| Visor de artes | páginas como imágenes, zoom, exterior/interior, comparar con la anterior (deslizador o lado a lado), comentarios anclados |
| Escáner | cámara a pantalla completa con guía, lectura por pistola en segundo plano, confirmación con vibración |
| Etiqueta de bulto | plantilla de impresión A6 con `@page`, QR SVG |
| Gráficos | barras, líneas, donut; SVG servidor, leyenda textual, tabla equivalente accesible |
| Estado vacío | icono + una frase + acción |

---

## 8. Pantallas de la versión 2

Para cada pantalla: para quién, qué muestra, acciones (icono · color · confirmación) y cómo se adapta.

### 8.1 Acceso e invitación

- **Acceso**: logotipo, campo de correo, «Entrar con passkey», enlace «Enviarme un enlace». Nada más. En móvil ocupa toda la pantalla.
- **Invitación**: «Jorge Martín te invita como Gerente · FH Plenilunio», nombre editable, «Crear passkey». Mensaje claro si la invitación caducó, con botón para pedir una nueva al remitente.
- **Enlace mágico**: pantalla de «revisa tu correo» con el dominio del correo; al volver, sesión abierta y oferta de registrar passkey.

### 8.2 Carcasa de la aplicación

- Sidebar de iconos (expandible), con contador en Aprobaciones y Soporte. En móvil: barra inferior con 5 destinos (Campañas, Aprobaciones, Kits, Soporte, Más) en vez de menú hamburguesa; el gerente ve (Campañas, Recepción, Reposiciones, Soporte, Más).
- Barra superior: título, buscador global (`⌘K`), campana de notificaciones, avatar cuadrado con menú (cuenta, modo oscuro, salir).
- Buscador global: campañas, restaurantes, kits, tickets y pedidos por código o nombre.

### 8.3 Panel de campañas

- KPI en una fila de 4 (2×2 en móvil): activas, versiones pendientes, incidencias abiertas, próxima entrega.
- Tabla: campaña, marca, en restaurante (fecha + relativo), restaurantes, fase (chip), progreso, semáforo. Ordenable por fecha y semáforo. Filtro por marca y fase en la URL.
- Acciones: `+` nueva campaña (navy, solo admin/ops) → formulario en panel lateral; fila → detalle.
- Vista alternativa **calendario** (mes) con los hitos por campaña; se elige con un segmento tabla/calendario.

### 8.4 Detalle de campaña

- Cabecera: nombre, marca, en restaurante, restaurantes, chip de fase, semáforo con motivo.
- Fases con fechas; la fase actual destacada; hito vencido en rojo.
- Soportes: tabla con versiones, tirada, estado, fecha comprometida, responsable; acción por fila: ver aprobación (neutro), subir artes (navy, ops/producción).
- Lateral: kits (resumen por estado con enlace), tickets de la campaña, documentos (brief, artes aprobadas).
- Acciones de cabecera: editar (neutro), duplicar como plantilla (neutro), archivar (rojo, confirmación).

### 8.5 Aprobación de artes finales

- Tres columnas en escritorio: lista de soportes con pendientes → lista de versiones (filtro todas/pendientes) → visor. En tablet: dos columnas y el visor a pantalla completa al abrir. En móvil: pantallas encadenadas.
- Visor: páginas en imagen, exterior/interior, zoom, comparar con la versión anterior (deslizador), comentarios anclados a un punto de la página.
- Acciones de la versión: ✓ aprobar (verde, confirmación con el código de la versión; deshacer 8 s), ↩ pedir cambios (ámbar, exige comentario), ⟲ reabrir (ámbar, confirmación), ⤓ descargar PDF (neutro).
- Acciones del soporte: ✓✓ aprobar todas las pendientes (verde, confirmación con el número de versiones y lista).
- Aprobación con registro: nombre, fecha y hora, dispositivo, revisión del fichero (hash). Se exporta como PDF de acta por soporte.
- Subida (ops/producción): arrastrar varios PDF; el código de versión se lee del nombre del fichero y se confirma en una tabla antes de publicar; genera las páginas y notifica a la marca.

### 8.6 Kits y etiquetas

- Selector de campaña; resumen por estado (chips con conteo, clicables como filtro); fases de trazabilidad del kit seleccionado.
- Tabla/fichas de kits: kit, restaurante, bultos, estado, último evento; acción contextual según estado (navy, icono de escáner): escanear expedición / entrada / salida; «Imprimir etiquetas» (neutro) por selección múltiple.
- **Escaneo** (`/kits/escaneo`): pantalla completa, cámara con guía o pistola; cada lectura muestra kit, restaurante y el paso que se va a registrar; confirmación con vibración y sonido; lista de lo escaneado en la sesión; funciona sin cobertura y sincroniza al recuperar la red (cola en IndexedDB mediante el service worker).
- **Recepción en restaurante** (`/kits/recepcion`, gerente, móvil): kits pendientes de su restaurante, lista de verificación de bultos, foto obligatoria si falta algo, «Confirmar recepción» (verde, pantalla de confirmación) o «Abrir incidencia» (ámbar, tipo + descripción + foto).
- Etiqueta de bulto: plantilla A6 imprimible con QR del kit, contenido por versión y bulto n/N; impresión por lote.

### 8.7 QR de versión (público)

- Un código por pieza. Página de 1 pantalla: estado (vigente / sustituida el dd/mm), restaurante al que pertenece el lote, y tres acciones grandes: pedir reposición (navy, elige cantidad, confirmación), avisar de error (ámbar, motivo), marcar retirada (rojo, confirmación).
- Sin sesión. Límite por IP. Los pedidos nacen «pendientes de validar».
- Generación de códigos desde Aprobaciones al aprobar: lote por versión y restaurante, exportable como SVG/PDF para la imprenta.

### 8.8 Reposiciones

- Restaurante (fijo para el gerente; selector para los demás). Catálogo en cuadrícula de fichas: nombre, descripción técnica en tooltip `?`, precio y unidad, plazo; cantidad y `+` (navy).
- Carrito en panel lateral fijo (escritorio) o barra inferior con total y «Ver pedido» (móvil). «Enviar pedido» (navy, confirmación con total y plazo).
- Pedidos: tabla con estado, fecha, importe; detalle con líneas y eventos; cancelar (rojo, confirmación) solo en «En preparación».
- Validación de pedidos del QR (ops): aceptar (verde) / rechazar (rojo con motivo).

### 8.9 Informes

- Filtro por marca y periodo (12 meses, trimestre, año). KPI: OTIF, incidencias, piezas, reposiciones, tiempo medio de aprobación.
- Gráficos SVG servidor: OTIF mensual (línea con objetivo), consumo por marca (barras apiladas), incidencias por tipo (donut con tabla), aprobación por marca (barras horizontales), top soportes y top reposiciones (tablas).
- Exportar (neutro): CSV de cada tabla y PDF del informe completo generado en servidor.

### 8.10 Maestro de restaurantes

- KPI por marca; tabla con filtro por marca, buscador, columnas configurables; fichas en móvil.
- Ficha: edición en panel lateral; campos con valores cerrados (tarifa, idioma, surtido, entrega) como selectores; «Guardar» (navy) con confirmación si cambia tarifa, idioma o surtido (afecta a qué versión recibe el restaurante); histórico de cambios en la ficha.
- Importar Excel (navy): subir, previsualizar diferencias (altas, cambios, bajas) y confirmar con el recuento. Alta manual. Desactivar restaurante (rojo, confirmación con nombre).
- Validación trimestral: fecha de última validación y botón «Validar» (verde) que registra quién y cuándo.

### 8.11 Soporte e incidencias

- Lista con filtros (abiertas / todas, tipo, campaña, restaurante, severidad) en la URL; cada registro con chips de tipo, motivo y estado.
- Detalle en panel lateral: hilo de actualizaciones con fotos, responsable, kit o pedido vinculado.
- Acciones: responder (navy), asignar (neutro), cambiar severidad (neutro), cerrar (verde, confirmación), reabrir (ámbar). Nuevo registro (navy) con tipo, campaña, restaurante opcional, texto, foto.
- Notificación por correo y en la campana al responsable y a quien abrió.

### 8.12 Administración

- **Usuarios**: tabla, invitar (navy), editar rol y ámbito (neutro, confirmación), suspender (ámbar, confirmación), eliminar (rojo, escribir nombre).
- **Invitaciones**: pendientes, reenviar, revocar (rojo).
- **Auditoría**: filtro por usuario, acción, entidad y fechas; exportar CSV.
- **Catálogo**: altas y precios de reposiciones (ops).
- **Ajustes**: datos de la empresa, correo remitente, plazos por defecto de las fases (para calcular hitos), objetivo OTIF.

### 8.13 Cuenta

- Nombre, correo, idioma, tema (sistema / claro / oscuro), notificaciones por correo (qué y cuándo).
- Passkeys registradas (nombre, fecha, último uso, eliminar con confirmación), sesiones activas (cerrar), descargar mis datos, eliminar cuenta.

### 8.14 Notificaciones

- Campana con lista; cada una con enlace a la entidad. Tipos: versiones pendientes de aprobar (marca), versión aprobada / cambios pedidos (ops), kit recibido / incidencia (ops), respuesta en ticket (quien abrió), pedido validado (gerente), invitación aceptada (quien invitó).
- Correo con resumen diario a las 9:00 para pendientes, e inmediato para incidencias de severidad alta. Web Push opcional en fase posterior.

---

## 9. PWA y rendimiento

### 9.1 PWA

- `manifest.webmanifest`: nombre, iconos 192/512 maskable, `display: standalone`, `start_url: /campanas`, tema por propuesta de diseño, atajos (Recepción, Escaneo, Reposiciones).
- Service worker (Workbox): precache de la carcasa y fuentes; `NetworkFirst` para páginas; `StaleWhileRevalidate` para imágenes de artes; nunca cachea respuestas con sesión en la caché compartida.
- Cola sin conexión: eventos de escaneo y recepción se guardan en IndexedDB y se reenvían (Background Sync) con marca de tiempo original; la interfaz lo indica con un icono de pendiente.
- Aviso de instalación discreto tras el segundo uso en móvil; nunca un banner que tape contenido.
- Actualizaciones: nueva versión → aviso «Actualizar» en la barra; no recarga sola a mitad de un escaneo.

### 9.2 Presupuesto de rendimiento (en 4G, móvil medio)

| Métrica | Objetivo |
|---|---|
| TTFB | < 200 ms (Vercel edge / VPS en Europa) |
| LCP | < 1,5 s |
| INP | < 100 ms |
| JS por ruta | < 60 KB comprimido; rutas de informes y maestro < 30 KB |
| CSS | < 20 KB comprimido |
| Fuentes | subconjunto latino, `woff2`, `font-display: swap`, máximo 4 ficheros |
| Peticiones en la carga inicial | < 15 |

Se mide en CI con Lighthouse CI sobre el entorno de previsualización; una regresión de más del 10 % falla la comprobación.

### 9.3 Técnicas

- Todo SSR; `prerender` para páginas estáticas (acceso, aviso legal); `csr = false` en las rutas que no necesitan JS (informes, auditoría).
- Imágenes de artes en WebP con varias anchuras y `srcset`; carga perezosa fuera del visor.
- Caché HTTP: `Cache-Control: private, no-store` en todo lo que lleva sesión; `public, max-age=1y, immutable` en estáticos con hash.
- Consultas con índices en `campaigns(brand_code, in_restaurant_on)`, `kits(campaign_id, state)`, `support_versions(support_id, status)`, `tickets(state, opened_at)`, `audit_log(user_id, at)`.
- Conexiones a Postgres con pool (Neon serverless driver en Vercel; `pg` con pool en VPS), detrás de la misma interfaz de Drizzle.

---

## 10. Pruebas y calidad

- **Unidad** (Vitest): permisos, cálculo de hitos y semáforo, descomposición de códigos de versión, validaciones Zod.
- **Integración** (Vitest + Postgres en Docker): servicios de dominio con transacciones (aprobar, escanear, pedido, invitación).
- **Extremo a extremo** (Playwright): un flujo por rol sobre el seed; capturas automáticas en 375, 768, 1024 y 1440 px de cada pantalla para revisar el diseño adaptable; comprobación de accesibilidad con `axe`.
- **Seguridad**: pruebas de permisos negativos (cada rol intenta lo que no puede), cabeceras, límite de intentos; `npm audit` en CI.
- **CI (GitHub Actions)**, respetando la cuota de la cuenta: solo `ubuntu-latest`, `timeout-minutes: 15`, `concurrency` con `cancel-in-progress`, `paths-ignore` para `docs/**` y `*.md`, una sola ejecución por PR (no se repite en el push a `main`). El despliegue lo hace la integración Git de Vercel, que **no consume minutos de Actions**.

---

## 11. Despliegue

### 11.1 Ahora: Vercel

- Proyecto vinculado al repositorio: previsualización por PR, producción en `main`.
- `adapter-vercel`; región `fra1`; funciones Node (no edge) para tener acceso a Postgres y a la conversión de PDF.
- Base de datos: Neon (Postgres gestionado, rama por previsualización con el seed). Ficheros: Vercel Blob. Correo: Resend. Variables de entorno por entorno.
- Dominio: subdominio propio (p. ej. `portal.promopicking.com`) con certificado automático. Mientras tanto, `*.vercel.app` con protección por contraseña de Vercel para las previsualizaciones.
- Coste previsto: plan Hobby o Pro según uso; Neon y Blob tienen capa gratuita suficiente para la fase de pruebas.

### 11.2 Después: VPS

- `adapter-node`; imagen Docker de una etapa final en `node:22-alpine`; `docker compose` con `app`, `postgres`, `caddy` (TLS automático, HTTP/3) y `minio` (o almacenamiento de objetos del proveedor).
- Migración: `pg_dump` desde Neon → restauración; copia de Blob a S3 con un script; cambio de DNS con TTL bajo. Sin cambios de código: solo adaptador y variables.
- Copias de seguridad: `pg_dump` diario cifrado a almacenamiento externo con retención 30 días; prueba de restauración mensual.
- Operación: actualizaciones automáticas de seguridad del sistema, `fail2ban`, cortafuegos con solo 80/443/SSH por clave, monitorización de disponibilidad (Uptime Kuma u otro), Sentry o GlitchTip para errores, logs rotados.
- Despliegue al VPS desde CI con `ssh` + `docker compose pull && up -d` solo en etiquetas de versión (`v1.2.0`), no en cada push.

---

## 12. Fases de trabajo

| Fase | Entregable | Criterio de hecho |
|---|---|---|
| 0 · Decisiones | Elección de propuesta de diseño con dos pantallas maquetadas por propuesta; confirmación de la pila | Documento de decisiones firmado por las dos partes |
| 1 · Cimientos | Repo, SvelteKit, Tailwind con tokens, Drizzle y esquema, seed desde el prototipo, Better Auth con invitaciones + passkeys + enlace mágico, carcasa con navegación y modo oscuro, PWA básica, CI, despliegue en Vercel | Entrar por invitación con passkey en el móvil y ver el panel con datos del seed |
| 2 · Campañas y maestro | Panel, detalle, calendario, maestro con edición e importación, administración de usuarios | Un admin crea una campaña y un usuario de marca la ve solo en su marca |
| 3 · Aprobaciones | Subida de PDF con conversión, visor, comparación, comentarios, aprobar / cambios / todas, acta PDF, notificaciones | Marta aprueba desde el iPad y Jorge recibe el aviso |
| 4 · Kits | Trazabilidad, escaneo con cámara y pistola, cola sin conexión, etiquetas imprimibles, recepción móvil con foto e incidencia | Un kit recorre los 5 estados desde tres dispositivos, uno sin cobertura |
| 5 · QR y reposiciones | Landing pública, generación de códigos, catálogo, carrito, pedidos, validación | Un pedido desde QR llega validado a reparto |
| 6 · Soporte e informes | Tickets completos, informes SVG, exportaciones | Informe mensual exportado en PDF coincide con los datos |
| 7 · Pulido | Accesibilidad, rendimiento (presupuesto cumplido), pruebas E2E por rol, textos revisados, aviso legal | Lighthouse ≥ 95 en móvil en las 5 pantallas principales |
| 8 · VPS | Docker, Caddy, migración de datos, copias de seguridad, monitorización | Restauración de copia probada; DNS cambiado |

Cada fase termina con una demostración sobre el entorno de previsualización y se despliega a producción en Vercel al cerrarse.

---

## 13. Decisiones pendientes

1. ~~Propuesta de diseño~~ **Decidido: B Lámina** con las reglas de 7.5.
2. **Framework**: SvelteKit (recomendado) o Next.js.
3. **Autenticación**: Better Auth (recomendado) o implementación propia.
4. **Nombre del repositorio y carpeta**: propuesta `portal-promopicking` en `~/Desktop/proyectos/`.
5. **Dominio** del portal y remitente de correo (hace falta verificar el dominio en Resend).
6. **Idiomas**: solo español o preparar catalán e inglés desde el principio (afecta a textos y a nada más).
7. **Qué campos del maestro puede editar Alsea** y cuáles solo Promopicking.
8. **Obligatoriedad de foto** en la recepción: siempre o solo con incidencia.
9. **Web Push**: ahora o fase posterior.
10. **Proveedor de VPS** y almacenamiento de objetos para la fase 8.

---

## Anexo A · Correspondencia prototipo → versión 2

| Prototipo (`portal.html`) | Versión 2 |
|---|---|
| `USERS` con desplegable de perfil | `users` + roles + ámbito; invitaciones |
| `RTES` (42) | `restaurants` con los 489 reales importados de Excel |
| `CAMPAIGNS` + `calDates()` | `campaigns` + `campaign_milestones` calculados al crear y editables |
| `APPROVALS` + `mkVersions()` | `supports` + `support_versions` con ficheros reales |
| `kitsOf()` generado | `kits` + `kit_events` reales por escaneo |
| `CATALOG`, `ORDERS` | `catalog_items`, `orders`, `order_lines` |
| `TICKETS` | `tickets`, `ticket_updates` con fotos |
| `REPORTS` fijos | vistas SQL calculadas |
| `QR` propio | `qrcode` en servidor + `qr_codes` |
| `auth.php`, `usuarios.txt` | Better Auth, passkeys, enlace mágico |
| `App.toast` | avisos con deshacer; diálogos de confirmación |

## Anexo B · Variables de entorno previstas

```
DATABASE_URL            Postgres
AUTH_SECRET             clave de firma de sesiones
AUTH_ORIGIN             https://portal.ejemplo.com (para WebAuthn: rpID y origen)
MAIL_PROVIDER           resend | smtp
RESEND_API_KEY / SMTP_*
MAIL_FROM               portal@ejemplo.com
STORAGE_PROVIDER        vercel-blob | s3
BLOB_READ_WRITE_TOKEN / S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET
SENTRY_DSN
PUBLIC_APP_NAME         Portal de servicio
```
