# =============================================================================
# frontend.Dockerfile
# Qué hace:     construye la imagen de la interfaz en dos etapas:
#                 1. compila la aplicación con Vite (genera archivos estáticos);
#                 2. los sirve con nginx, que además reenvía /api al servidor.
# Se construye desde la RAÍZ del proyecto (ver docker-compose.yml).
# =============================================================================

# Etapa 1: compilar
FROM node:22-alpine AS compilar
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# Etapa 2: servir. Solo esta etapa queda en la imagen final (sin Node ni código).
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilar /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
