# =============================================================================
# backend.Dockerfile
# Qué hace:     construye la imagen del servidor (API). Instala las dependencias,
#               compila TypeScript a JavaScript y deja listo el arranque.
# Se construye desde la RAÍZ del proyecto (ver docker-compose.yml).
#
# La imagen incluye también scripts/ y base_datos/ porque, al iniciar, el
# servidor aplica las migraciones y carga los datos de demostración con
# ts-node (npm run preparar_demo), y eso necesita las dependencias de desarrollo.
# =============================================================================
FROM node:22-alpine

WORKDIR /app

# 1) Dependencias. Se copian primero solo los archivos de paquetes: mientras no
#    cambien, Docker reutiliza esta capa y no vuelve a descargar nada.
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci

# 2) Código: servidor, comandos de apoyo y migraciones con su semilla.
COPY backend backend
COPY scripts scripts
COPY base_datos base_datos

# 3) Compilar TypeScript (genera backend/dist).
RUN cd backend && npm run build

# 4) Arranque. Se quitan los saltos de línea de Windows (\r) por si el archivo
#    se descargó con Git de Windows: con ellos el script no se ejecutaría.
COPY docker/entrada.sh /entrada.sh
RUN sed -i 's/\r$//' /entrada.sh && chmod +x /entrada.sh

EXPOSE 3000
ENTRYPOINT ["/entrada.sh"]
