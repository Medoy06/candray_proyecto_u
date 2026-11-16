#!/usr/bin/env bash
# =============================================================================
# verificar_roles.sh
# Qué hace:     comprueba que la lista de roles sea la misma en los tres lugares
#               donde existe (backend, base de datos y frontend), que cada rol
#               tenga su nombre en pantalla y que la regla "quién ve todas las
#               sucursales" sea igual en el backend y en el frontend.
# Uso:          bash scripts/verificar_roles.sh      (desde la carpeta del proyecto)
# Por qué:      el frontend no puede leer la lista del backend, así que hay una
#               copia en cada lado. Si alguien agrega un rol y olvida un lugar,
#               este script lo avisa en vez de dejar un hueco silencioso.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ayudas_verificacion.sh"

ROLES_BACKEND="$RAIZ/backend/src/configuracion/roles.ts"
ROLES_FRONTEND="$RAIZ/frontend/src/configuracion/roles.ts"
ALCANCE_BACKEND="$RAIZ/backend/src/intermediarios/alcanceSucursal.ts"
MIGRACIONES="$RAIZ/base_datos/migraciones"

echo "Roles"

backend="$(lista_de "$ROLES_BACKEND" 'export const ROLES = [')"
frontend="$(lista_de "$ROLES_FRONTEND" 'export const ROLES = [')"

# En la base de datos: los valores de CREATE TYPE user_role y los que agregan
# las migraciones posteriores con ALTER TYPE user_role ADD VALUE.
base_datos="$(
  {
    awk '/CREATE TYPE user_role AS ENUM \(/ { dentro = 1 } dentro { print } dentro && /\);/ { exit }' \
      "$MIGRACIONES/01_base.sql" | sed 's/--.*$//' | grep -o "'[a-z_]*'"
    grep -h "ALTER TYPE user_role ADD VALUE" "$MIGRACIONES"/*.sql 2>/dev/null | grep -o "'[a-z_]*'" || true
  } | tr -d "'"
)"

[ -n "$backend" ]   || error "no se pudo leer la lista de roles del backend ($ROLES_BACKEND)"
[ -n "$frontend" ]  || error "no se pudo leer la lista de roles del frontend ($ROLES_FRONTEND)"
[ -n "$base_datos" ] || error "no se pudo leer el tipo user_role de la base de datos"

if [ -n "$backend" ] && [ -n "$frontend" ] && [ -n "$base_datos" ]; then
  if comparar_listas "backend" "$backend" "frontend" "$frontend" \
     && comparar_listas "backend" "$backend" "base de datos" "$base_datos"; then
    bien "los tres lugares tienen los mismos $(echo "$backend" | wc -w) roles"
  else
    error "la lista de roles no es igual en el backend, el frontend y la base de datos"
  fi

  # Cada rol necesita su nombre en pantalla (ROLE_LABELS en el frontend).
  etiquetas="$(awk '/ROLE_LABELS/ { dentro = 1 } dentro { print } dentro && /^};/ { exit }' "$ROLES_FRONTEND" \
    | grep -oE "^  [a-z_]+:" | tr -d ' :' || true)"
  if comparar_listas "ROLES" "$backend" "ROLE_LABELS" "$etiquetas"; then
    bien "cada rol tiene su nombre en pantalla"
  else
    error "ROLE_LABELS del frontend no coincide con la lista de roles"
  fi
fi

# La regla "este rol ve todas las sucursales" vive en el backend (la que manda)
# y en una copia del frontend que solo sirve para el formulario de usuarios.
todas_backend="$(lista_de "$ALCANCE_BACKEND" 'const ROLES_WITH_ALL_BRANCHES')"
todas_frontend="$(lista_de "$ROLES_FRONTEND" 'const ROLES_WITH_ALL_BRANCHES')"
if [ -z "$todas_backend" ] || [ -z "$todas_frontend" ]; then
  error "no se pudo leer la lista ROLES_WITH_ALL_BRANCHES de alguno de los dos lados"
elif comparar_listas "backend" "$todas_backend" "frontend" "$todas_frontend"; then
  bien "los roles que ven todas las sucursales son los mismos en ambos lados ($(echo $todas_backend))"
else
  error "los roles que ven todas las sucursales no coinciden entre backend y frontend"
fi

terminar
