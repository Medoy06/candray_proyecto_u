#!/bin/sh
# =============================================================================
# crear_usuario.sh
# Qué hace:     crea el usuario de la aplicación y su base de datos. Lo ejecuta
#               PostgreSQL una sola vez, cuando el volumen está vacío.
# Variable:     DB_PASSWORD, la contraseña de candray_user.
#
# candray_user NO es administrador de PostgreSQL, igual que en una instalación
# normal del proyecto: por eso los permisos que la migración 01 le quita sobre la
# bitácora de auditoría sí tienen efecto.
# =============================================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE candray_user LOGIN PASSWORD '${DB_PASSWORD}';
CREATE DATABASE candray_mockup OWNER candray_user;
SQL
