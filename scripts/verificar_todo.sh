#!/usr/bin/env bash
# =============================================================================
# verificar_todo.sh
# Qué hace:     corre, uno tras otro, todas las comprobaciones del proyecto y
#               al final dice cuáles pasaron y cuáles fallaron:
#                 - verificar_roles.sh, verificar_rutas.sh y auditar_estructura.sh
#                 - que el backend y el frontend compilen
#                 - las pruebas del backend y del frontend
#                 - la compilación de producción del frontend
# Uso:          bash scripts/verificar_todo.sh            (todo, tarda un par de minutos)
#               bash scripts/verificar_todo.sh --rapido   (solo lo estático, sin pruebas)
# Requiere:     las dependencias instaladas (npm install) y, para las pruebas del
#               backend, PostgreSQL encendido con la base candray_test.
# =============================================================================
set -uo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAPIDO=false
[ "${1:-}" = "--rapido" ] && RAPIDO=true

RESULTADOS=()
FALLOS=0
REGISTRO="$(mktemp)"
trap 'rm -f "$REGISTRO"' EXIT

# Corre un paso y anota si pasó. Si falla, muestra el final de lo que imprimió.
# Recibe: el nombre del paso, la carpeta donde correrlo y el comando.
paso() {
  local nombre="$1" carpeta="$2"; shift 2
  printf '%-52s' "$nombre"
  if (cd "$carpeta" && "$@") >"$REGISTRO" 2>&1; then
    echo "pasó"
    RESULTADOS+=("pasó    $nombre")
  else
    echo "FALLÓ"
    RESULTADOS+=("FALLÓ   $nombre")
    FALLOS=$((FALLOS + 1))
    tail -n 25 "$REGISTRO" | sed 's/^/      /'
  fi
}

paso "Roles iguales en backend, base de datos y frontend" "$RAIZ" bash scripts/verificar_roles.sh
paso "Rutas con permiso y capacidades iguales"           "$RAIZ" bash scripts/verificar_rutas.sh
paso "Estructura y convenciones del proyecto"            "$RAIZ" bash scripts/auditar_estructura.sh
paso "El backend compila (TypeScript)"                   "$RAIZ/backend" npx tsc --noEmit
paso "El frontend compila (TypeScript)"                  "$RAIZ/frontend" npx tsc -b

if [ "$RAPIDO" = false ]; then
  paso "Pruebas del backend"                             "$RAIZ/backend" npm test
  paso "Pruebas del frontend"                            "$RAIZ/frontend" npm test
  paso "Compilación de producción del frontend"          "$RAIZ/frontend" npm run build
fi

echo
if [ "$FALLOS" -gt 0 ]; then
  echo "Resultado: $FALLOS paso(s) fallaron."
  exit 1
fi
echo "Resultado: todo pasó$([ "$RAPIDO" = true ] && echo ' (modo rápido: sin pruebas)')."
