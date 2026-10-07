# -----------------------------------------------------------------------------
# Price Updater — Web client (Angular 19)
#
# Stage 1 builds the production bundle; stage 2 serves it with nginx.
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The API base URL is compiled into the bundle. Override it at build time with
#   docker build --build-arg API_URL=https://api.example.com/api/v1 ...
# or, through Compose, by setting WEB_API_URL in `.env`.
# Without it, the value committed in src/environments/environment.ts is used.
ARG API_URL=""
RUN if [ -n "$API_URL" ]; then \
      sed -i "s#apiUrl: '[^']*'#apiUrl: '${API_URL}'#" src/environments/environment.ts; \
      echo "environment.ts patched: apiUrl = ${API_URL}"; \
    fi

# The default configuration is `production`; the application builder writes the
# browser bundle to dist/prices-admin/browser.
RUN npm run build

# -----------------------------------------------------------------------------
# Runtime — a static web server, nothing else.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/prices-admin/browser /usr/share/nginx/html

EXPOSE 80
