#!/usr/bin/env bash
# Publica en el servidor la última versión de GitHub (después de cada push):
#
#   bash /var/www/partly/deploy/actualizar.sh
#
# Respalda la base antes de aplicar migraciones, recompila y reinicia la API. Si algo falla, la versión
# anterior de la API sigue corriendo hasta el reinicio, y el respaldo queda en /var/www/partly-datos/respaldos.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESPALDOS="/var/www/partly-datos/respaldos"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m✔\033[0m %s\n' "$*"; }
# Memoria para compilar: en un servidor chico Node se limita a ~256 MB y la compilación se queda sin memoria.
# Se le da casi toda la RAM + swap (sin pasar de 2 GB) solo a los comandos que compilan.
memoria_compilar() {
  local total
  total=$(awk '/MemTotal|SwapTotal/ {s += $2} END {print int(s / 1024)}' /proc/meminfo)
  local heap=$((total - 768))
  [ "$heap" -gt 2048 ] && heap=2048
  [ "$heap" -lt 768 ] && heap=768
  echo "--max-old-space-size=$heap"
}
falla() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

export NVM_DIR="$HOME/.nvm"
set +euo pipefail # nvm no está escrito para modo estricto
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
set -euo pipefail
command -v pm2 >/dev/null || falla "No encuentro Node/pm2: ¿ya corriste deploy/instalar-servidor.sh?"

paso "1/4 Bajando la última versión"
cd "$REPO_DIR"
git pull --ff-only
ok "$(git log --oneline -1)"

paso "2/4 Respaldo de la base de datos"
mkdir -p "$RESPALDOS"
ARCHIVO="$RESPALDOS/partly-$(date +%Y%m%d-%H%M).dump"
(cd /tmp && sudo -u postgres pg_dump -Fc partly) >"$ARCHIVO"
chmod 600 "$ARCHIVO"
# Se guardan los 10 más recientes.
ls -1t "$RESPALDOS"/partly-*.dump | tail -n +11 | xargs -r rm -f
ok "respaldo en $ARCHIVO"

paso "3/4 Backend"
cd "$REPO_DIR/backend"
npm ci --no-audit --no-fund
npx prisma generate >/dev/null
npx prisma migrate deploy
NODE_OPTIONS="$(memoria_compilar)" npm run build
pm2 restart partly-api --update-env >/dev/null
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3001/api/health/live >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -fsS http://127.0.0.1:3001/api/health/live >/dev/null 2>&1; then
  pm2 logs partly-api --lines 30 --nostream || true
  falla "La API no volvió a arrancar. Mándame una captura de lo de arriba."
fi
ok "API funcionando"

paso "4/4 Frontend"
cd "$REPO_DIR/frontend"
npm ci --no-audit --no-fund
NODE_OPTIONS="$(memoria_compilar)" npx ng build
ok "listo: la nueva versión ya está publicada"
