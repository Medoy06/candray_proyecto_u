# =============================================================================
# postgres.Dockerfile
# Qué hace:     imagen de PostgreSQL 16 que, solo la primera vez (con el volumen
#               vacío), crea el usuario candray_user y la base candray_mockup.
# Se construye desde la RAÍZ del proyecto (ver docker-compose.yml).
# =============================================================================
FROM postgres:16-alpine

# Todo archivo de esta carpeta se ejecuta una vez al crear la base. Se quitan los
# saltos de línea de Windows (\r) por si el archivo se descargó con Git de Windows.
COPY docker/postgres/crear_usuario.sh /docker-entrypoint-initdb.d/crear_usuario.sh
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/crear_usuario.sh \
 && chmod +x /docker-entrypoint-initdb.d/crear_usuario.sh
