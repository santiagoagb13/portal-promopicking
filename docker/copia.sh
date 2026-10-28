#!/bin/sh
# Copia de seguridad diaria (plan 11.2): base de datos y ficheros, cifrados, con 30 días de retención.
# Uso en el servidor (cron, como root, desde la carpeta docker/):
#   15 3 * * *  cd /opt/portal/docker && ./copia.sh >> /var/log/portal-copia.log 2>&1
# Requiere BACKUP_PASSPHRASE en docker/.env. Si hay BACKUP_RCLONE_REMOTE (p. ej. «hetzner:portal-copias»),
# además sube la copia fuera del servidor con rclone.
set -eu
cd "$(dirname "$0")"
. ./.env
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE en .env}"

DEST="${BACKUP_DIR:-./copias}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
export BACKUP_PASSPHRASE

echo "[$STAMP] Copia de la base de datos"
docker compose exec -T db pg_dump -U portal -d portal --format=custom --no-owner \
	| openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
	> "$DEST/portal-$STAMP.dump.enc"

echo "[$STAMP] Copia de los ficheros"
docker compose run --rm --no-deps -T --entrypoint tar app -C /data -cz ficheros \
	| openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
	> "$DEST/ficheros-$STAMP.tar.gz.enc"

find "$DEST" -name '*.enc' -mtime +30 -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
	echo "[$STAMP] Subida a $BACKUP_RCLONE_REMOTE"
	rclone copy "$DEST" "$BACKUP_RCLONE_REMOTE" --include "*$STAMP*"
	rclone delete "$BACKUP_RCLONE_REMOTE" --min-age 30d
fi
echo "[$STAMP] Hecho: $(ls -1 "$DEST" | grep -c "$STAMP") ficheros"
