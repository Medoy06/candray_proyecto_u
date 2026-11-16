#!/bin/sh
# =============================================================================
# entrada.sh
# Qué hace:     es lo primero que ejecuta el contenedor del servidor:
#                 1. si no se indicó JWT_SECRET, genera una firma aleatoria;
#                 2. prepara la base de datos (migraciones y, si está vacía,
#                    los datos de demostración);
#                 3. inicia la API.
# Depende de:   scripts/preparar_demo.ts y backend/dist (lo deja listo la imagen).
# =============================================================================
set -e

# La firma de las sesiones debe tener al menos 32 caracteres. Si no se dio una,
# se crea una aleatoria en cada inicio: las sesiones abiertas se cierran al
# reiniciar el contenedor, que para una demostración no importa.
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  export JWT_SECRET
fi

cd /app/backend
npm run preparar_demo

# exec: la API pasa a ser el proceso principal, así recibe la orden de apagado.
exec node dist/index.js
