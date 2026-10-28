# Publicar la demo en Vercel (modo pruebas)

El portal se publica en modo pruebas: se ve entero sin login, con los datos ficticios del prototipo y un selector «Ver como» para cambiar de perfil (ADR 0013). Solo hace falta Vercel y una base de datos Neon, ambas en su plan gratuito.

Lo que sigue lo hace la persona titular: hay que entrar en cuentas, aceptar condiciones y crear recursos. El código ya está preparado en la rama `main` del repositorio `santiagoagb13/portal-promopicking`.

## 1. Crear el proyecto

1. Entra en <https://vercel.com> con la cuenta de GitHub `santiagoagb13`.
2. **Add New… › Project** e importa `santiagoagb13/portal-promopicking`. Si no aparece, en **Adjust GitHub App Permissions** da acceso a ese repositorio.
3. Deja lo que Vercel detecta: framework SvelteKit y comando de compilación `vercel-build` (sale del `package.json`).
4. En **Environment Variables** añade una sola:

   | Nombre        | Valor |
   | ------------- | ----- |
   | `PORTAL_DEMO` | `1`   |

5. Pulsa **Deploy**. Este primer despliegue **fallará** al migrar, porque aún no hay base de datos. Es lo esperado.

## 2. Añadir la base de datos

1. En el proyecto, pestaña **Storage › Create Database › Neon** (Serverless Postgres). Acepta la integración.
2. Región: **Frankfurt (eu-central-1)**, la más cercana a las funciones (fra1). Plan gratuito.
3. Conéctala al proyecto en todos los entornos. Vercel añade sola la variable `DATABASE_URL` (y otras `PG…` que no hacen falta).

## 3. Volver a desplegar

1. **Deployments**, el último despliegue, menú **⋯ › Redeploy**.
2. La compilación aplica las migraciones, carga los datos de ejemplo y las artes de muestra (unos minutos la primera vez) y publica.
3. Abre la URL de producción (`https://<proyecto>.vercel.app`). Se entra directamente como Jorge Martín; arriba está el selector «Ver como».

Cada despliegue nuevo (cada push a `main`) vuelve a dejar los datos como al principio.

## Opcional

- **Dominio propio**: **Settings › Domains**. El modo pruebas toma el origen solo, salvo que se fije `AUTH_ORIGIN`.
- **Restringir el acceso**: el enlace de producción es público, aunque no se indexa. Para pedir contraseña, Vercel la ofrece en sus planes de pago (**Settings › Deployment Protection**).

## Pasar a uso real

1. Quita `PORTAL_DEMO`.
2. Añade:
   - `AUTH_SECRET`: `openssl rand -base64 32`.
   - `AUTH_ORIGIN`: el dominio definitivo.
   - `MAIL_PROVIDER` y `RESEND_API_KEY`: dominio verificado en Resend.
   - `STORAGE_PROVIDER=s3` con su bucket (R2 o S3).
3. Vacía la base de datos de ejemplo.
4. Invita al primer administrador con `npm run invitar-admin` (ver README).
