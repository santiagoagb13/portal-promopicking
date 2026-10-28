# Paso a VPS (fase 8)

Guía para llevar el portal de Vercel a un servidor propio (plan, 11.2). El código no cambia: se compila con `adapter-node` (`ADAPTER=node`) y se configura con variables de entorno. Todo lo necesario está en `docker/`:

| Fichero               | Para qué                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docker/Dockerfile`   | Imagen `node:22-alpine` con el servidor compilado. Al arrancar aplica las migraciones y comprueba su salud en `/salud`. |
| `docker/compose.yml`  | `app`, `db` (Postgres 16) y `caddy` (HTTPS automático y HTTP/3); `herramientas` para el seed y el primer administrador. |
| `docker/Caddyfile`    | Proxy inverso con compresión, límite de 60 MB para los PDF y registro rotado.                                           |
| `docker/.env.example` | Variables del servidor; se copia a `docker/.env`, que no se sube al repositorio.                                        |
| `docker/copia.sh`     | Copia diaria cifrada de la base de datos y los ficheros, con 30 días de retención y subida opcional con rclone.         |
| `docker/restaura.sh`  | Restauración de una copia (y prueba mensual de restauración).                                                           |

Ficheros: en el VPS van por defecto a disco (volumen `ficheros`), que entra en la copia. Si se prefiere almacenamiento de objetos del proveedor (Hetzner Object Storage, Cloudflare R2…), se usa `STORAGE_PROVIDER=s3`, como en Vercel. MinIO no se incluye porque su edición comunitaria ya no publica imágenes mantenidas.

## Lo que tiene que hacer la persona titular

Requieren cuenta, pago o acceso que solo tiene ella:

1. Contratar el VPS: 2 vCPU, 4 GB de RAM y 40 GB de disco bastan. En la UE (por ejemplo, Hetzner en Núremberg o Falkenstein), con Ubuntu 24.04 LTS y acceso SSH por clave.
2. Elegir el destino de las copias fuera del servidor (un bucket o una Storage Box) y sus credenciales para rclone.
3. Tener a mano el acceso al DNS del dominio y el proveedor de correo (Resend o SMTP).

## Preparar el servidor (una vez)

```bash
# Como root en el VPS
apt update && apt -y upgrade && apt -y install unattended-upgrades fail2ban ufw rclone
dpkg-reconfigure -plow unattended-upgrades
ufw default deny incoming && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw allow 443/udp && ufw enable
# SSH solo con clave: PasswordAuthentication no en /etc/ssh/sshd_config y systemctl restart ssh
curl -fsSL https://get.docker.com | sh
git clone git@github.com:santiagoagb13/portal-promopicking.git /opt/portal
cd /opt/portal/docker && cp .env.example .env && chmod 600 .env
```

Rellenar `docker/.env`. `POSTGRES_PASSWORD`, `AUTH_SECRET` y `BACKUP_PASSPHRASE` se generan con `openssl rand -base64 32`. La clave de las copias se guarda además fuera del servidor: sin ella no se pueden restaurar.

## Primer arranque

```bash
cd /opt/portal/docker
git checkout v1.0.0                 # siempre una etiqueta de versión
docker compose up -d --build
docker compose ps                   # app «healthy»
curl -fsS https://$PORTAL_DOMAIN/salud
```

Primer administrador, si la base de datos está vacía:

```bash
docker compose --profile herramientas run --rm herramientas invitar-admin -- correo@dominio.com "Nombre Apellido"
```

## Migrar desde Vercel (Neon + ficheros)

1. Bajar el TTL del registro DNS a 300 s un día antes.
2. Avisar de una ventana corta sin cambios y poner el proyecto de Vercel en mantenimiento, o simplemente no usarlo durante la copia.
3. Base de datos: volcar Neon (usar la cadena **sin** `-pooler`) y restaurarla en el VPS.

   ```bash
   pg_dump "$NEON_URL" --format=custom --no-owner --no-acl > neon.dump
   docker compose exec -T db pg_restore -U portal -d portal --clean --if-exists --no-owner < neon.dump
   ```

4. Ficheros, si Vercel usaba S3/R2: copiarlos al volumen local con rclone, o dejar `STORAGE_PROVIDER=s3` apuntando al mismo bucket.

   ```bash
   rclone copy r2:portal-ficheros /var/lib/docker/volumes/portal_ficheros/_data
   ```

5. Cambiar el DNS al VPS y comprobar `/salud`, el acceso con passkey, un PDF de aprobaciones y una foto de incidencia.
6. Las passkeys siguen sirviendo si el dominio (`AUTH_ORIGIN`) es el mismo que en Vercel. Si cambia, cada persona entra por enlace mágico y crea una passkey nueva.

## Copias de seguridad y prueba de restauración

```bash
# crontab -e (root)
15 3 * * *  cd /opt/portal/docker && ./copia.sh >> /var/log/portal-copia.log 2>&1
```

Prueba mensual (criterio de la fase: «restauración de copia probada»). Se restaura la última copia en un proyecto de compose aparte, sin tocar producción:

```bash
cd /opt/portal/docker
COMPOSE_PROJECT_NAME=portal-prueba docker compose up -d --wait db
COMPOSE_PROJECT_NAME=portal-prueba ./restaura.sh copias/portal-<fecha>.dump.enc copias/ficheros-<fecha>.tar.gz.enc
COMPOSE_PROJECT_NAME=portal-prueba docker compose exec db psql -U portal -c "select count(*) from campaigns"
COMPOSE_PROJECT_NAME=portal-prueba docker compose down -v
```

## Operación

- **Actualizar**: `git fetch --tags && git checkout vX.Y.Z && docker compose up -d --build`. Las migraciones se aplican al arrancar.
- **Desplegar desde CI**: el plan prevé hacerlo solo en etiquetas de versión (ssh + `docker compose pull && up -d`). No se ha añadido el flujo para no gastar minutos de Actions; se activará cuando haya servidor.
- **Monitorización**: Uptime Kuma (o similar) contra `https://<dominio>/salud` cada minuto. Errores con `SENTRY_DSN` (Sentry o GlitchTip).
- **Registros**: `docker compose logs -f app`. Caddy rota su registro de accesos (20 MB × 10).
- **Espacio**: `docker system df`. Las copias locales se borran solas a los 30 días.
