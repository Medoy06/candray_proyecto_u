#!/usr/bin/env bash
# =============================================================================
# instalar_wsl.sh
# Qué hace:     deja el proyecto listo para usarse en WSL (Ubuntu) o en
#               cualquier Ubuntu/Debian: instala Node.js y PostgreSQL si faltan,
#               crea el usuario y las bases de datos, escribe backend/.env,
#               instala las dependencias y carga los datos de demostración.
# Uso:          bash scripts/instalar_wsl.sh      (desde la carpeta del proyecto)
# Requiere:     una terminal de Ubuntu y permiso de sudo (pedirá su contraseña).
#
# Se puede ejecutar más de una vez sin problema:
#   - lo que ya está instalado se omite;
#   - si backend/.env ya existe, no se toca (así no se pierde su contraseña);
#   - las bases se crean solo si no existen.
# Los pasos manuales equivalentes están en docs/instalacion.md.
# =============================================================================
set -euo pipefail

# La raíz del proyecto es la carpeta que contiene a scripts/ (donde está este archivo).
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USUARIO_BD="candray_user"
BD_DEMO="candray_mockup"   # la que usa el sistema
BD_PRUEBAS="candray_test"  # la que usan las pruebas del backend (se borra y recrea sola)
NODE_MINIMO=22

paso() { echo; echo "==> $1"; }
fallar() { echo "ERROR: $1" >&2; exit 1; }

# Ejecuta una instrucción SQL como el administrador de PostgreSQL.
# Se entra desde "/" para que no avise de carpetas sin permiso.
sql() { (cd / && sudo -u postgres psql -v ON_ERROR_STOP=1 -tA -c "$1"); }

command -v apt-get >/dev/null || fallar "este script usa apt-get (Ubuntu o Debian). En otro sistema siga docs/instalacion.md."
[[ -d "$RAIZ/backend" && -d "$RAIZ/frontend" ]] || fallar "no se encontró backend/ y frontend/ junto a scripts/."

if [[ "$RAIZ" == /mnt/* ]]; then
  echo "AVISO: el proyecto está en el disco de Windows (/mnt/...). Funciona, pero es mucho más lento."
  echo "       Es mejor clonarlo dentro de WSL, por ejemplo en ~/candray_proyecto_u."
fi

# -----------------------------------------------------------------------------
paso "1/6 Paquetes del sistema (git, curl, openssl y PostgreSQL)"
sudo apt-get update
sudo apt-get install -y git curl openssl ca-certificates postgresql postgresql-contrib

# -----------------------------------------------------------------------------
paso "2/6 Node.js $NODE_MINIMO o superior"
version_node() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [[ "$(version_node)" -lt "$NODE_MINIMO" ]]; then
  echo "Instalando Node.js ${NODE_MINIMO} desde NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MINIMO}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node.js $(node -v), npm $(npm -v)"

# -----------------------------------------------------------------------------
paso "3/6 Iniciar PostgreSQL"
# En WSL el servicio no siempre arranca solo; este comando funciona con o sin systemd.
sudo service postgresql start || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  (cd / && sudo -u postgres pg_isready -q) && break
  sleep 1
done
(cd / && sudo -u postgres pg_isready -q) || fallar "PostgreSQL no responde. Pruebe: sudo service postgresql start"

# -----------------------------------------------------------------------------
paso "4/6 Usuario y bases de datos"
ENV_ARCHIVO="$RAIZ/backend/.env"
if [[ -f "$ENV_ARCHIVO" ]]; then
  echo "backend/.env ya existe: se conserva. Se usa la contraseña que ya tiene."
  CLAVE_BD="$(sed -n 's/^DB_PASSWORD=//p' "$ENV_ARCHIVO" | head -n 1)"
  [[ -n "$CLAVE_BD" ]] || fallar "backend/.env no tiene DB_PASSWORD. Complételo o bórrelo para generarlo de nuevo."
else
  CLAVE_BD="$(openssl rand -hex 16)"   # solo letras y números: no necesita comillas en SQL
fi

if [[ "$(sql "SELECT 1 FROM pg_roles WHERE rolname='${USUARIO_BD}'")" == "1" ]]; then
  # El usuario ya existe: se deja con la contraseña que corresponde a backend/.env.
  sql "ALTER ROLE ${USUARIO_BD} LOGIN PASSWORD '${CLAVE_BD}'" >/dev/null
  echo "Usuario ${USUARIO_BD}: ya existía, contraseña actualizada."
else
  sql "CREATE ROLE ${USUARIO_BD} LOGIN PASSWORD '${CLAVE_BD}'" >/dev/null
  echo "Usuario ${USUARIO_BD}: creado."
fi

for base in "$BD_DEMO" "$BD_PRUEBAS"; do
  if [[ "$(sql "SELECT 1 FROM pg_database WHERE datname='${base}'")" == "1" ]]; then
    echo "Base ${base}: ya existía."
  else
    sql "CREATE DATABASE ${base} OWNER ${USUARIO_BD}" >/dev/null
    echo "Base ${base}: creada."
  fi
done

# -----------------------------------------------------------------------------
paso "5/6 Archivo backend/.env"
if [[ -f "$ENV_ARCHIVO" ]]; then
  echo "Se conserva el existente."
else
  [[ -f "$RAIZ/backend/.env.example" ]] || fallar "falta backend/.env.example."
  FIRMA="$(openssl rand -hex 32)"   # firma de las sesiones: 64 caracteres aleatorios
  sed -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${CLAVE_BD}|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${FIRMA}|" \
      "$RAIZ/backend/.env.example" > "$ENV_ARCHIVO"
  chmod 600 "$ENV_ARCHIVO"   # solo su usuario puede leerlo
  echo "Creado backend/.env con una contraseña y una firma generadas al azar."
fi

# -----------------------------------------------------------------------------
paso "6/6 Dependencias y datos de demostración"
(cd "$RAIZ/backend" && npm install)
(cd "$RAIZ/frontend" && npm install)
(cd "$RAIZ/backend" && npm run reiniciar_demo)

echo
echo "Listo. Para usar el sistema abra DOS terminales:"
echo "  Terminal 1:  cd $RAIZ/backend  &&  npm run dev"
echo "  Terminal 2:  cd $RAIZ/frontend &&  npm run dev"
echo "Luego abra http://localhost:5173 en el navegador."
echo "Usuarios y contraseña de demostración: ver LEEME.md."
