# Portal de servicio Promopicking · imagen para el VPS (fase 8, plan 11.2).
# Construir desde la raíz del repositorio:  docker build -f docker/Dockerfile -t portal .

# --- Dependencias (todas) para compilar ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Compilación con adapter-node ---
FROM deps AS build
COPY . .
ENV ADAPTER=node
RUN npx svelte-kit sync && npm run build

# --- Herramientas (seed, invitar al primer admin): docker compose run --rm herramientas … ---
FROM build AS herramientas
ENTRYPOINT ["npm", "run"]

# --- Dependencias de producción ---
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm instala como «peer» de better-auth herramientas de compilación (vite, vitest, typescript,
# drizzle-kit…) que el servidor compilado no usa: fuera, la imagen pasa de ~600 a ~480 MB.
RUN npm ci --omit=dev --ignore-scripts \
	&& rm -rf node_modules/vite node_modules/vitest node_modules/@vitest node_modules/typescript \
		node_modules/drizzle-kit node_modules/rolldown node_modules/@rolldown node_modules/esbuild \
		node_modules/@esbuild node_modules/@sveltejs node_modules/lightningcss* node_modules/.bin

# --- Imagen final: solo el servidor compilado, las dependencias de producción y las migraciones ---
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 STORAGE_LOCAL_DIR=/data/ficheros
WORKDIR /app
RUN apk add --no-cache tini && addgroup -S portal && adduser -S portal -G portal \
	&& mkdir -p /data/ficheros && chown portal:portal /data/ficheros
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY src/lib/server/db/migrations ./migrations
COPY docker/migrate.mjs ./migrate.mjs
USER portal
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/salud || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node migrate.mjs && node build"]
