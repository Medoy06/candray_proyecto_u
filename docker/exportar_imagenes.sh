#!/bin/sh
# =============================================================================
# exportar_imagenes.sh
# Qué hace:     construye las tres imágenes del sistema y las guarda juntas en
#               un solo archivo (candray-imagenes.tar.gz), para llevarlas a otro
#               computador SIN internet ni necesidad de construir nada allá.
# Uso:          desde la carpeta principal del proyecto:
#                 sh docker/exportar_imagenes.sh
# En el otro computador (solo necesita Docker, este archivo y docker-compose.yml):
#                 docker load -i candray-imagenes.tar.gz
#                 docker compose up -d --no-build
#
# Las imágenes sirven solo para el mismo tipo de procesador con que se
# construyeron (por ejemplo, Intel/AMD con Intel/AMD). Con otro tipo (Mac con
# chip Apple frente a un PC con Windows), se debe construir en el computador de
# destino con "docker compose up -d --build".
# =============================================================================
set -e
cd "$(dirname "$0")/.."

echo "Construyendo las imágenes..."
docker compose build

echo "Guardando candray-imagenes.tar.gz (puede tardar un par de minutos)..."
docker save candray/base_datos:1.0 candray/backend:1.0 candray/frontend:1.0 | gzip > candray-imagenes.tar.gz

echo
echo "Listo: candray-imagenes.tar.gz"
echo "Lleve ese archivo y docker-compose.yml al otro computador y siga los pasos de docs/instalacion.md (Camino C)."
