#!/bin/sh
# Restaura una copia de docker/copia.sh. Para la prueba mensual (plan 11.2), mejor en otra máquina
# o en un proyecto de compose aparte: COMPOSE_PROJECT_NAME=portal-prueba ./restaura.sh …
# Uso: ./restaura.sh copias/portal-AAAAMMDDTHHMMSSZ.dump.enc [copias/ficheros-….tar.gz.enc]
set -eu
cd "$(dirname "$0")"
. ./.env
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE en .env}"
export BACKUP_PASSPHRASE
DUMP="${1:?Indica la copia de la base de datos (.dump.enc)}"
FILES="${2:-}"

echo "Restaurando la base de datos desde $DUMP (se sustituye la actual)"
docker compose up -d --wait db
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE < "$DUMP" \
	| docker compose exec -T db pg_restore -U portal -d portal --clean --if-exists --no-owner

if [ -n "$FILES" ]; then
	echo "Restaurando los ficheros desde $FILES"
	openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE < "$FILES" \
		| docker compose run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /data/ficheros/* && tar -C /data -xz'
fi
echo "Restauración terminada. Comprueba: curl -fsS https://\$PORTAL_DOMAIN/salud"
