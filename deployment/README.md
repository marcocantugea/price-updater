# Deployment · Despliegue

Docker assets for Price Updater. · Recursos Docker de Price Updater.

## Files · Archivos

| File · Archivo | Purpose · Propósito |
|----------------|---------------------|
| [`docker-compose.yml`](docker-compose.yml) | The whole stack built from source · Todo el stack construido desde el código |
| [`backend.Dockerfile`](backend.Dockerfile) | API image (Express + TypeScript + Prisma) |
| [`frontend.Dockerfile`](frontend.Dockerfile) | Web client image (Angular built, served by nginx) |
| [`nginx.conf`](nginx.conf) | SPA fallback and cache policy for the web image |
| [`.env.example`](.env.example) | Every value the stack accepts · Todos los valores configurables |

The quick start that pulls the published images lives at the repository root, in
[`../docker-compose.yml`](../docker-compose.yml).
· El inicio rápido que descarga las imágenes publicadas está en la raíz del
repositorio, en [`../docker-compose.yml`](../docker-compose.yml).

The `.dockerignore` that keeps the build context small lives at the repository
root, next to the sources it filters.
· El `.dockerignore` que mantiene pequeño el contexto de build está en la raíz
del repositorio.

## Quick start · Inicio rápido

Nothing is compiled: the [compose at the repository root](../docker-compose.yml)
pulls every service from Docker Hub, so it can be run on its own.
· No se compila nada: el [compose de la raíz](../docker-compose.yml) descarga
todos los servicios desde Docker Hub, así que se ejecuta por sí solo.

```bash
# from anywhere · desde cualquier lugar
curl -fsSLO https://raw.githubusercontent.com/marcocantugea/price-updater/main/docker-compose.yml
docker compose up -d
```

| Service · Servicio | URL |
|--------------------|-----|
| Web client | http://localhost:4200 |
| API health | http://localhost:3000/health |

| Image · Imagen | Contents · Contenido |
|----------------|----------------------|
| `marcocantugea/price-updater-api:1.1.0` | API, migrations and export worker |
| `marcocantugea/price-updater-web:1.1.0` | Angular bundle served by nginx |

Drop an `.env` next to the file to change secrets, ports or the browser origin.
· Pon un `.env` junto al archivo para cambiar secretos, puertos u origen.

## Build from source · Construir desde el código

```bash
cd deployment
cp .env.example .env     # Windows: copy .env.example .env
docker compose up --build
```

`docker-compose.yml` declares the same image names next to their `build:`, so
`docker compose pull && docker compose up -d` runs the released build instead of
compiling one. Set `IMAGE_TAG` in `.env` to pin another version.
· `docker-compose.yml` declara los mismos nombres de imagen junto a su `build:`,
así que `docker compose pull && docker compose up -d` ejecuta la versión publicada
en lugar de compilarla. Ajusta `IMAGE_TAG` en `.env` para fijar otra versión.

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
· La guía completa está en el [README principal](../README.md#docker-contenedores).
