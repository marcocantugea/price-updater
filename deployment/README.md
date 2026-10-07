# Deployment · Despliegue

Docker assets for Price Updater. · Recursos Docker de Price Updater.

## Files · Archivos

| File · Archivo | Purpose · Propósito |
|----------------|---------------------|
| [`docker-compose.yml`](docker-compose.yml) | The whole stack · Todo el stack: MySQL, API, export worker and web client |
| [`backend.Dockerfile`](backend.Dockerfile) | API image (Express + TypeScript + Prisma) |
| [`frontend.Dockerfile`](frontend.Dockerfile) | Web client image (Angular built, served by nginx) |
| [`nginx.conf`](nginx.conf) | SPA fallback and cache policy for the web image |
| [`.env.example`](.env.example) | Every value the stack accepts · Todos los valores configurables |

The `.dockerignore` that keeps the build context small lives at the repository
root, next to the sources it filters.
· El `.dockerignore` que mantiene pequeño el contexto de build está en la raíz
del repositorio.

## Run · Ejecutar

```bash
cd deployment
cp .env.example .env     # Windows: copy .env.example .env
docker compose up --build
```

| Service · Servicio | URL |
|--------------------|-----|
| Web client | http://localhost:4200 |
| API health | http://localhost:3000/health |

## Building an image on its own · Construir una imagen suelta

Both Dockerfiles use the **repository root** as their build context, so they are
invoked from the root, not from this folder:
· Ambos Dockerfile usan la **raíz del repositorio** como contexto de build, así
que se invocan desde la raíz, no desde esta carpeta:

```bash
# from the repository root · desde la raíz del repositorio
docker build -f deployment/backend.Dockerfile  -t price-updater-api .
docker build -f deployment/frontend.Dockerfile -t price-updater-web .
# point the bundle at a different API · apuntar el bundle a otra API
docker build -f deployment/frontend.Dockerfile \
  --build-arg API_URL=https://prices.example.com/api/v1 -t price-updater-web .
```

The full guide — services, variables and what to change before exposing the stack
to the internet — is in the main [README](../README.md#docker).
· La guía completa está en el [README principal](../README.md#docker--contenedores).
