# ADR 0013 · Modo pruebas: el portal entero sin login, publicado en Vercel

- Estado: aceptada (28/10/2026)
- Contexto: petición de la persona usuaria al acabar las fases. Como el portal está en fase de pruebas, debe poder verse entero sin login y publicarse en Vercel con lo mínimo.

## Decisiones

- **Una variable lo enciende y lo apaga**: `PORTAL_DEMO=1`. El acceso real (passkeys, enlace mágico, invitaciones) no se toca. Al quitar la variable, el portal vuelve a pedir acceso.
- **Entrada sin login**:
  - Quien llega sin sesión entra como Jorge Martín (administración).
  - La sesión la crea un punto de entrada de Better Auth **solo de servidor** (`createAuthEndpoint.serverOnly`): no existe como URL (la E2E lo comprueba con un 404).
  - Solo lo llaman los hooks (peticiones GET sin sesión) y el cambio de perfil, y solo para los cinco perfiles del seed. Con `PORTAL_DEMO` apagado, falla.
- **«Ver como»**:
  - Un aviso ámbar, siempre visible arriba («Modo pruebas · Datos ficticios y sin contraseña»), con un selector de los cinco perfiles del prototipo: Jorge (Promopicking), Marta, Carlos y Laura (marketing de cada marca) y Ana (gerente).
  - Es un formulario normal hacia `/modo-pruebas`, que cierra la sesión actual, abre la del perfil elegido y vuelve a la misma pantalla. Funciona sin JS.
  - Cada cambio queda en la auditoría.
- **Sin indexar**: con el modo pruebas, todas las respuestas llevan `X-Robots-Tag: noindex, nofollow`.
- **Lo mínimo en Vercel**: solo hace falta Postgres (Neon), y nada más que contratar.
  - **Ficheros en Postgres** (`STORAGE_PROVIDER=database`, tabla `stored_files`). En Vercel es el valor por defecto si no se indica otro, porque allí no hay disco.
    - Mismas URL firmadas que el disco (`/archivos/…`).
    - Límite: Vercel acepta como mucho 4,5 MB por petición, así que en la demo no se pueden subir PDF más grandes.
    - Para uso real: S3 o R2 (ADR 0007) o el VPS (ADR 0012).
  - **Correo**: sin `MAIL_PROVIDER`, en modo pruebas los correos solo se anotan en el registro. Nadie necesita entrar por correo.
  - **Clave de sesiones**: si falta `AUTH_SECRET`, en modo pruebas se deriva de `DATABASE_URL`, que ya es secreta. Fuera del modo pruebas sigue siendo obligatoria.
  - **Origen**: si falta `AUTH_ORIGIN`, en Vercel se usa el dominio de producción del proyecto o el de la previsualización.
  - **Fecha de referencia**: en modo pruebas se fija en el 22/10/2026 (como el prototipo), salvo que se indique `APP_REFERENCE_DATE`, para que los datos de ejemplo no envejezcan.
- **Datos**: `vercel-build` aplica las migraciones y, en modo pruebas (o en las previsualizaciones), vuelve a cargar el seed en cada despliegue. Cada despliegue deja la demo como nueva.

## Riesgos y límites

- **No hay que activarlo con datos reales**: quien tenga el enlace entra como administración y puede cambiar cosas. Por eso el aviso es permanente y la variable tiene un nombre explícito.
- El seed borra y vuelve a crear los datos en cada despliegue: lo que se haga en la demo dura hasta el siguiente.
- El dominio `*.vercel.app` de producción es público. Si se quiere restringir, Vercel tiene protección por contraseña en sus planes de pago.

## Pruebas

- `npm run test:demo` (`playwright.demo.config.ts`) prueba la demo con la misma configuración que en Vercel: `PORTAL_DEMO=1`, ficheros en Postgres y sin `AUTH_SECRET`. Comprueba:
  - Que entra sin login.
  - Que `/acceso` lleva al portal.
  - Que «Ver como» cambia de perfil y se mantiene al navegar.
  - Que las artes se sirven desde la base de datos.
  - La cabecera `noindex`.
  - Que el punto de entrada no existe como URL.
