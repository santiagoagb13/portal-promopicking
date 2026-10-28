# ADR 0011 · Decisiones de la fase 7 (pulido)

- Estado: aceptada (28/10/2026)
- Contexto: sección 9 del plan (rendimiento) y 4.3 (RGPD); criterio de la fase: «Lighthouse ≥ 95 en móvil en las 5 pantallas principales».

## Resultado

Lighthouse 12 en móvil (`node scripts/lighthouse.mjs`, compilación de producción en local):

| Pantalla        | Perfil  | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| --------------- | ------- | ----------- | ------------- | ---------------- | --- |
| /campanas       | admin   | 97          | 100           | 100              | 100 |
| /aprobaciones   | marca   | 97          | 100           | 100              | 100 |
| /kits/recepcion | gerente | 98          | 100           | 100              | 100 |
| /reposiciones   | gerente | 99          | 100           | 100              | 100 |
| /informes       | admin   | 100         | 100           | 100              | 100 |

## Presupuesto de JS (9.2)

- `tests/e2e/presupuesto.spec.ts` mide el JS y el CSS comprimidos de 13 rutas. Sustituye a la prueba que solo medía /campanas.
- **Informes y maestro sin JS en el cliente** (`csr = false`). El plan les pide menos de 30 KB, y solo el marco (Svelte y SvelteKit) ya ocupa 35 KB, así que la única forma de cumplirlo es no cargar JS.
  - Ya funcionaban sin JS: filtros por URL, paneles y confirmaciones abiertos por URL, y formularios con POST normal.
  - En maestro, las acciones conservan la ficha y los filtros en la URL, de modo que tras guardar se ve la misma vista con su aviso.
  - Los botones «Cerrar» y «Cancelar» de los paneles pasan a ser enlaces.
- **Carga diferida** de lo que solo se usa al pulsar:
  - El formulario de edición, el de calendario y el de soporte en el detalle de campaña.
  - El panel de subida de artes.
  - El cliente de passkeys en Cuenta (16 KB).
  - Sin JS siguen funcionando: el detalle de campaña los trae en la carga (`+page.ts`) si la URL los abre; la edición y la subida tienen sus páginas (`/campanas/<id>/editar`, `/aprobaciones/subir`).
- **Trozos de JS**: el marco, los iconos de la carcasa y los componentes comunes van en tres ficheros (`vite.config.ts`). Se probaron otras agrupaciones y salían peor en bytes o en peticiones.
- Dos iconos del detalle de campaña pasan a los de la navegación (Aprobaciones y Kits), que ya están cargados.
- **Peticiones**: entre 22 y 33 en la carga inicial (CSS, JS, fuentes, manifiesto e iconos), frente a las 15 del plan.
  - Bajar de ahí exigiría juntar el JS de todas las pantallas, y eso rompería el presupuesto de bytes.
  - Todas van por HTTP/2 al mismo origen y con `modulepreload`. Lighthouse no lo penaliza (rendimiento entre 97 y 100).
  - Se deja así y se anota la desviación.
- **CSS**: entre 7,5 y 10,4 KB comprimidos por ruta (límite 20).

## Accesibilidad

- `tests/e2e/roles.spec.ts` (pruebas por perfil): admin, dos marcas y gerente recorren su navegación a 1280 y a 375 px.
  - Comprueba que cada sección carga, que no desborda en el móvil y que axe (WCAG 2.1 AA) no da errores graves ni críticos.
  - Comprueba también que lo que no es de su perfil responde 403.
  - Hace una pasada en modo oscuro.
- Corregido:
  - El texto de los chips verdes no llegaba a 4,5:1 sobre su fondo; nuevo token `--green-ink`.
  - El área con desplazamiento del visor de artes no se alcanzaba con el teclado; ahora es una región enfocable con nombre.
  - El enlace «Más» de la barra inferior no decía adónde lleva; ahora dice «Más secciones» al lector de pantalla.
  - Faltaba la meta descripción.

## Aviso legal y privacidad

- `/aviso-legal`: página pública y sin JS, enlazada desde el acceso, el menú de la cuenta y «Más».
- Incluye titular, finalidad, datos tratados, base legal, conservación (anonimización al borrar la cuenta), encargados, derechos y cookies. Solo hay cookies técnicas, así que no hace falta banner de consentimiento.
- Los datos del titular (razón social, NIF, domicilio y correo de privacidad) se editan en Administración › Ajustes, como pedía 8.12. Mientras estén vacíos, la página los muestra como pendientes: no se inventan datos fiscales.
- El texto es un punto de partida razonable, no asesoramiento legal: conviene que lo revise quien lleve la protección de datos de Promopicking.

## Cuenta: avisos por correo (8.13)

- Hay dos opciones: «Campana y correo» (por defecto) o «Solo la campana».
- Afecta a los correos de soporte, los únicos avisos que se envían hoy por correo. Los enlaces de acceso e invitación llegan siempre.
- El resumen diario por correo que sugería el plan queda fuera: necesita una tarea programada (cron), que encaja con el despliegue de la fase 8.

## Pendiente

- Token propio para el endpoint de escáner (4.3). Hoy lo protege la comprobación de origen de SvelteKit en los POST con formulario, como al resto.
- Resumen diario por correo (ver arriba).
- Lighthouse en CI: el script está listo, pero no se añade a GitHub Actions para no gastar cuota.
