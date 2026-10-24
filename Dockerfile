# ---------------------------------------------------------------------------
# Single-service image: the Fastify backend serves the REST + WebSocket API AND
# the built React SPA from one port. One container → one public URL, seeded on
# first boot. Local `docker compose up` runs this exact image.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Native build toolchain for better-sqlite3.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install workspace deps (cached on manifest changes).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Build core → web → api.
COPY . .
RUN npm run build

# Prune to production dependencies for the runtime image.


# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/arm.sqlite \
    WEB_DIST=/app/apps/web/dist

# Non-root runtime user; /data holds the seeded SQLite file.
RUN useradd -r -u 10001 arm && mkdir -p /data && chown arm:arm /data
VOLUME /data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/aodb-samples ./aodb-samples
COPY --from=build /app/package.json ./package.json

USER arm
EXPOSE 8080
# The server seeds the database on boot if empty, then serves API + WS + SPA.
CMD ["node", "apps/api/dist/server.js"]
