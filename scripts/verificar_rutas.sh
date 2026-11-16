#!/usr/bin/env bash
# =============================================================================
# verificar_rutas.sh
# Qué hace:     revisa que las rutas del servidor y las capacidades (permisos)
#               estén bien conectadas:
#                 1. la lista de capacidades es la misma en backend y frontend;
#                 2. todo router exige authenticate y cada ruta exige una
#                    capacidad (la suya o la de todo el router);
#                 3. todo archivo de rutas está montado en app.ts;
#                 4. avisa de las capacidades que ninguna ruta usa todavía.
# Uso:          bash scripts/verificar_rutas.sh      (desde la carpeta del proyecto)
# Por qué:      una ruta sin permiso o sin montar no da error al compilar: se
#               descubriría tarde. La regla del proyecto es que una ruta nueva
#               nace protegida, y este script lo comprueba.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ayudas_verificacion.sh"

RUTAS="$RAIZ/backend/src/rutas"
APP="$RAIZ/backend/src/app.ts"

echo "Capacidades"
backend="$(lista_de "$RAIZ/backend/src/configuracion/permisos.ts" 'export const CAPABILITIES = [')"
frontend="$(lista_de "$RAIZ/frontend/src/configuracion/capacidades.ts" 'export const CAPABILITIES = [')"
if [ -z "$backend" ] || [ -z "$frontend" ]; then
  error "no se pudo leer la lista de capacidades de alguno de los dos lados"
elif comparar_listas "backend" "$backend" "frontend" "$frontend"; then
  bien "backend y frontend tienen las mismas $(echo "$backend" | wc -w) capacidades"
else
  error "la lista de capacidades no es igual en el backend y el frontend"
fi

echo "Rutas"
for archivo in "$RUTAS"/*.ts; do
  nombre="$(basename "$archivo" .ts)"

  # Está montado en app.ts.
  if grep -q "from './rutas/$nombre'" "$APP"; then
    bien "$nombre: montado en app.ts"
  else
    error "$nombre: el archivo de rutas no está importado en app.ts"
  fi

  # autenticacion.ts tiene el login, que es público a propósito: se revisa a mano.
  [ "$nombre" = "autenticacion" ] && continue

  # Todo el router exige estar autenticado.
  if ! grep -qE "^router\.use\(authenticate" "$archivo"; then
    error "$nombre: falta router.use(authenticate...)"
    continue
  fi

  # Cada ruta exige una capacidad: la del router completo (router.use con can)
  # o la suya propia. Una sentencia puede ocupar varias líneas.
  if grep -qE "^router\.use\(.*can\(" "$archivo"; then
    bien "$nombre: el router completo exige una capacidad"
  else
    sin_permiso="$(awk '
      /^router\.(get|post|put|patch|delete)\(/ { dentro = 1; texto = ""; linea = FNR }
      dentro { texto = texto $0 " " }
      dentro && /\);[[:space:]]*$/ { if (texto !~ /can\(/) print linea; dentro = 0 }
    ' "$archivo" | tr '\n' ' ')"
    if [ -z "$sin_permiso" ]; then
      bien "$nombre: cada ruta exige su capacidad"
    else
      error "$nombre: rutas sin can(...) en las líneas $sin_permiso"
    fi
  fi
done

# Las capacidades que se piden en las rutas deben existir (el compilador también
# lo comprueba, pero aquí el mensaje dice qué ruta se equivocó).
usadas="$(grep -rhoE "can\('[a-z_]+'\)" "$RUTAS" | grep -oE "'[a-z_]+'" | tr -d "'" | sort -u)"
for capacidad in $usadas; do
  echo "$backend" | grep -qx "$capacidad" || error "una ruta pide la capacidad '$capacidad', que no existe en permisos.ts"
done

# Capacidades declaradas que ninguna ruta del servidor exige.
for capacidad in $backend; do
  echo "$usadas" | grep -qx "$capacidad" || aviso "la capacidad '$capacidad' existe pero ninguna ruta la exige todavía"
done

terminar
