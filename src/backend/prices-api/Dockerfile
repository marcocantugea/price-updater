# -----------------------------------------------------------------------------
# Price Updater — API (Express + TypeScript + Prisma + MySQL)
#
# The image ships the compiled application *and* the Prisma CLI, because the
# one-shot `migrate` service in docker-compose.yml applies the migrations and
# runs the idempotent seed from this same image before the API starts.
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim

# Prisma's query engine links against OpenSSL at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so editing the sources only invalidates the layers below.
#
# NODE_ENV is deliberately NOT set to "production" yet: npm (and `npm ci`) skip
# devDependencies when it is, and the build needs TypeScript, the Prisma CLI and
# ts-node. It is set to production after the build, further down.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Emit the typed client (node_modules/.prisma/client), compile src/ + prisma/
# into dist/, and create the directory the export worker writes to.
RUN npx prisma generate \
 && npm run build \
 && mkdir -p /app/storage/exports

ENV NODE_ENV=production

EXPOSE 3000

# `tsconfig.json` uses `rootDir: "."` so the output mirrors the source tree.
CMD ["node", "dist/src/server.js"]
