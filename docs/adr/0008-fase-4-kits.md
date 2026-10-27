# ADR 0008 · Decisiones de la fase 4 (kits y trazabilidad)

- Estado: aceptada (27/10/2026)
- Contexto: secciones 8.6, 9.1 y 4.2 del plan; criterio de la fase: «un kit recorre los 5 estados desde tres dispositivos, uno sin cobertura».

## Decisiones

- **Decisión pendiente 8 del plan (foto en la recepción): obligatoria solo al abrir una incidencia.** Confirmar una recepción completa no la pide, para no frenar al gerente. Se cambia en `openIncident` y `receiveKit` si se decide «siempre».
- **Generación de kits desde el maestro** (Kits › Generar kits, solo Promopicking): un kit por restaurante activo de la marca, con una línea por soporte. Cada línea lleva la versión que corresponde a la tarifa, el surtido y el idioma del restaurante (`versionFor`; si el idioma es compuesto, «SP + EN», cuenta el primero) y las unidades por kit del soporte. El plan no lo detallaba; sin esto no hay kits para las campañas nuevas.
- **Pasos estrictos**: solo se registra el paso siguiente al estado actual. Repetir un paso que ya consta no es un error («ya constaba»): lo provocan otro dispositivo o la cola al reenviar.
- **Hora del dispositivo**: cada evento guarda cuándo se escaneó (`at`) y cuándo llegó al servidor (`recorded_at`). La trazabilidad marca los que llegaron tarde. `at` se acota: nunca en el futuro, ni de hace más de 14 días, ni anterior al evento previo del mismo kit.
- **Idempotencia**: cada evento lleva un id de cliente único (`client_event_id`), de modo que reenviar la cola no duplica nada.

## Escaneo

- **Pistola o teclado**: escriben el código en el campo y Enter.
- **Cámara**: `BarcodeDetector` del navegador y, si no existe, `zxing-wasm`, que se descarga solo en `/kits/escaneo` y con su `.wasm` servido desde el propio dominio.
- **CSP**: compilar WebAssembly exige `'wasm-unsafe-eval'`. Se añade solo en las rutas con cámara, las mismas en las que `Permissions-Policy` permite la cámara.
- **Formatos de código**: el id suelto (`K-FH2609-0147`), `K-…/n` o la URL del QR de la etiqueta (`/k/<kit>/<bulto>`), que lleva al gerente a su recepción y al resto a la trazabilidad. La búsqueda no distingue mayúsculas: hay códigos del prototipo como `K-VI2603b-0023`.
- **Confirmación** a pantalla completa, con vibración y sonido.

## Sin cobertura (9.1)

- La cola vive en IndexedDB (`src/lib/offline/queue.ts`, sin dependencias) y la comparten la página y el service worker.
- Se reenvía con Background Sync donde existe (Chrome y Android). En Safari, que no lo tiene, se reenvía desde la página al volver la red y al abrirla.
- Los rechazos del servidor (p. ej. «falta la expedición») quedan en la cola con su motivo; los fallos de red paran el envío hasta la siguiente vez.

## Recepción e incidencias

- **Recepción**: hay que marcar todos los bultos y se confirma a pantalla completa (7.1, regla 4).
- **Incidencia**: tipo, descripción y foto. Antes de enviarla, la foto se reduce en el móvil a 1600 px en JPEG; en el servidor se comprueba su firma (JPEG, PNG o WebP) y que no pase de 10 MB.
- La incidencia abre un ticket `INC-…`, deja un evento en el kit y avisa a Operaciones y Administración.
- **Desviación del plan**: no se avisa de cada kit recibido (serían cientos por campaña); solo de las incidencias. El resumen por campaña llega con los informes (fase 6).

## Etiquetas

Una etiqueta A6 por bulto (`@page size: A6`), con un QR en SVG generado en el servidor (`qrcode`), el destinatario y el contenido por versión. Se imprimen varias a la vez eligiendo kits en la lista.

## Pendiente

- Lector por token para pistolas que no estén en un navegador con sesión (4.3 menciona «token en el endpoint de escáner»). Hoy el endpoint exige sesión y comprueba el origen; el token llegará si hace falta un dispositivo sin navegador.
- Las pruebas de cámara son manuales: Playwright prueba la pistola o el teclado y la cola sin conexión, no la lectura de vídeo.
