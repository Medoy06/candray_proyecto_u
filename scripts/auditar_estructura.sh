#!/usr/bin/env bash
# =============================================================================
# auditar_estructura.sh
# Qué hace:     revisa que el proyecto siga las reglas de docs/convenciones.md
#               que se pueden comprobar sin ejecutar nada:
#                 1. cada archivo de código empieza con su encabezado
#                    (línea de "=====" y su propio nombre en la segunda línea);
#                 2. las pruebas se llaman *.prueba.ts o *.prueba.tsx y ninguna
#                    quedó con .only (que dejaría las demás sin correr);
#                 3. los archivos de código no pasan de 350 líneas;
#                 4. cada carpeta principal tiene su LEEME.md;
#                 5. las migraciones están numeradas 01, 02, 03... sin saltos;
#                 6. backend/.env no se sube a git y existe .env.example;
#                 7. no quedan pendientes (TODO, FIXME) ni console.log sueltos.
# Uso:          bash scripts/auditar_estructura.sh      (desde la carpeta del proyecto)
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ayudas_verificacion.sh"
cd "$RAIZ"

LIMITE_LINEAS=350

# Todos los archivos de código del proyecto, sin dependencias ni resultados de compilar.
codigo() {
  find backend frontend scripts base_datos \
    \( -name node_modules -o -name dist -o -name coverage \) -prune -o \
    -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' \) -print | sort
}
# Los mismos, pero solo el código de la aplicación (sin pruebas).
codigo_aplicacion() {
  codigo | grep -vE '/pruebas/|\.prueba\.tsx?$' || true
}

echo "Encabezados"
malos=""
while IFS= read -r archivo; do
  nombre="$(basename "$archivo")"; base="${nombre%.*}"
  primera="$(sed -n 1p "$archivo")"; segunda="$(sed -n 2p "$archivo")"
  if ! [[ "$primera" =~ ^(//|--)\ =====+ ]] || ! [[ "$segunda" == *"$base"* ]]; then
    malos="$malos $archivo"
  fi
done < <(codigo)
if [ -z "$malos" ]; then bien "todos los archivos de código tienen su encabezado con su nombre"
else for archivo in $malos; do error "encabezado incompleto (línea 1 con ===== y línea 2 con el nombre): $archivo"; done; fi

echo "Pruebas"
mal_nombre="$(find backend/pruebas frontend/pruebas -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/ayudas/*' -not -name '*.prueba.ts' -not -name '*.prueba.tsx' | sort)"
if [ -z "$mal_nombre" ]; then bien "todas las pruebas terminan en .prueba.ts o .prueba.tsx"
else for archivo in $mal_nombre; do error "una prueba debería llamarse *.prueba.ts(x): $archivo"; done; fi

solo="$(grep -rnE "\b(it|describe|test)\.only\(" backend/pruebas frontend/pruebas --include=*.ts --include=*.tsx || true)"
if [ -z "$solo" ]; then bien "ninguna prueba usa .only"
else error "hay pruebas con .only (las demás no correrían):"; echo "$solo" | sed 's/^/          /'; fi

echo "Tamaño"
grandes=""
while IFS= read -r archivo; do
  lineas="$(wc -l < "$archivo")"
  [ "$lineas" -gt "$LIMITE_LINEAS" ] && grandes="$grandes $archivo($lineas)"
done < <(codigo_aplicacion | grep -v '\.sql$')
if [ -z "$grandes" ]; then bien "ningún archivo de la aplicación pasa de $LIMITE_LINEAS líneas"
else for item in $grandes; do error "archivo demasiado largo (divídalo): $item"; done; fi

echo "Carpetas"
sin_leeme=""
for carpeta in backend/src/*/ frontend/src/*/ frontend/src/paginas/*/ base_datos/*/ ; do
  [ -f "${carpeta}LEEME.md" ] || sin_leeme="$sin_leeme $carpeta"
done
if [ -z "$sin_leeme" ]; then bien "cada carpeta principal tiene su LEEME.md"
else for carpeta in $sin_leeme; do error "falta LEEME.md en $carpeta"; done; fi

echo "Migraciones"
errores_antes="$ERRORES"
esperado=1
for archivo in base_datos/migraciones/*.sql; do
  numero="$(basename "$archivo" | grep -oE '^[0-9]+' || true)"
  if [ -z "$numero" ] || [ $((10#$numero)) -ne "$esperado" ]; then
    error "se esperaba la migración número $(printf '%02d' "$esperado") y está $(basename "$archivo")"
    break
  fi
  esperado=$((esperado + 1))
done
[ "$ERRORES" -eq "$errores_antes" ] && bien "las migraciones están numeradas sin saltos (hasta la $(printf '%02d' $((esperado - 1))))"

echo "Secretos"
if [ -d .git ] && git ls-files --error-unmatch backend/.env >/dev/null 2>&1; then
  error "backend/.env está en git y no debería (tiene contraseñas)"
else
  bien "backend/.env no está en git"
fi
[ -f backend/.env.example ] && bien "existe backend/.env.example" || error "falta backend/.env.example"

echo "Pendientes"
pendientes="$(codigo | xargs grep -nE "(//|--|#)[[:space:]]*(TODO|FIXME|XXX)\b" 2>/dev/null || true)"
if [ -z "$pendientes" ]; then bien "no hay TODO ni FIXME en el código"
else error "hay pendientes sin resolver:"; echo "$pendientes" | sed 's/^/          /'; fi

sueltos="$(codigo_aplicacion | grep -E '^(backend|frontend)/src/' | grep -v 'backend/src/index.ts' | xargs grep -nE "console\.(log|debug)" 2>/dev/null || true)"
if [ -z "$sueltos" ]; then bien "no hay console.log sueltos en la aplicación"
else error "console.log en el código de la aplicación:"; echo "$sueltos" | sed 's/^/          /'; fi

terminar
