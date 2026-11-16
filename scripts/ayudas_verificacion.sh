#!/usr/bin/env bash
# =============================================================================
# ayudas_verificacion.sh
# Qué hace:     funciones comunes de los scripts de verificación: imprimir
#               resultados, contar errores y leer listas de los archivos.
# Lo usan:      verificar_roles.sh, verificar_rutas.sh y auditar_estructura.sh
#               (con "source"; este archivo no se ejecuta solo).
# =============================================================================

# La raíz del proyecto es la carpeta que contiene a scripts/.
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERRORES=0
AVISOS=0

# Resultados: "ok" para lo que está bien, "aviso" para lo que conviene revisar
# pero no rompe nada, y "error" para lo que hay que corregir.
bien()  { echo "  ok:     $*"; }
aviso() { echo "  aviso:  $*"; AVISOS=$((AVISOS + 1)); }
error() { echo "  ERROR:  $*"; ERRORES=$((ERRORES + 1)); }

# Lista de textos entre comillas simples de un arreglo de TypeScript.
# Recibe: el archivo y un texto que aparece en la línea donde empieza el arreglo.
# El arreglo termina en la primera línea con "as const;" o "];". Los comentarios
# se ignoran para que una palabra entre comillas dentro de uno no cuente.
lista_de() {
  awk -v inicio="$2" 'index($0, inicio) { dentro = 1 }
                      dentro { print }
                      dentro && /as const;|\];/ { exit }' "$1" \
    | sed 's://.*$::' | grep -o "'[a-z_]*'" | tr -d "'" || true
}

# Compara dos listas como CONJUNTOS (el orden no importa).
# Imprime lo que está en una y falta en la otra. Devuelve 0 si son iguales.
comparar_listas() {
  local nombre_a="$1" lista_a="$2" nombre_b="$3" lista_b="$4"
  local solo_a solo_b
  solo_a="$(comm -23 <(printf '%s\n' $lista_a | sort -u) <(printf '%s\n' $lista_b | sort -u) | tr '\n' ' ')"
  solo_b="$(comm -13 <(printf '%s\n' $lista_a | sort -u) <(printf '%s\n' $lista_b | sort -u) | tr '\n' ' ')"
  [ -z "$solo_a" ] && [ -z "$solo_b" ] && return 0
  [ -n "$solo_a" ] && echo "          solo en $nombre_a: $solo_a"
  [ -n "$solo_b" ] && echo "          solo en $nombre_b: $solo_b"
  return 1
}

# Cierra el script: imprime el resumen y sale con 1 si hubo algún error.
terminar() {
  echo
  if [ "$ERRORES" -gt 0 ]; then
    echo "Resultado: $ERRORES error(es) y $AVISOS aviso(s)."
    exit 1
  fi
  echo "Resultado: todo en orden ($AVISOS aviso(s))."
}
