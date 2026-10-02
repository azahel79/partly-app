#!/usr/bin/env bash
# Instala Partly en un servidor Debian/Ubuntu nuevo (Amazon Lightsail). Se corre UNA vez, con tu usuario
# normal (no root), desde la carpeta del repo ya clonado:
#
#   cd /var/www/partly && bash deploy/instalar-servidor.sh
#
# Hace las fases 2 a 8 de la guía: paquetes, swap, Node y pm2, base de datos, .env con secretos nuevos,
# backend, frontend y nginx. Te pregunta solo lo que no puede inventar (el correo de envío y los datos de Google).
# Si algo falla, puedes volver a correrlo: lo que ya quedó hecho se respeta (el .env y sus secretos no se tocan).
set -euo pipefail

DOMINIO="${DOMINIO:-tequio.com.mx}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATOS_DIR="/var/www/partly-datos"
ENV_FILE="$REPO_DIR/backend/.env"

paso() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m✔\033[0m %s\n' "$*"; }
falla() { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }
# psql como el usuario postgres, desde una carpeta que sí puede leer.
pg() { (cd /tmp && sudo -u postgres "$@"); }

[ "$(id -u)" -ne 0 ] || falla "Córrelo con tu usuario normal (por ejemplo admin), no como root ni con sudo."
[ -f "$REPO_DIR/backend/package.json" ] || falla "No encuentro el backend en $REPO_DIR. Corre el script desde la carpeta del repo."

echo "Partly se instalará para https://$DOMINIO desde $REPO_DIR"

# ---------------------------------------------------------------------------------------------------------------
paso "1/8 Paquetes del sistema (git, nginx, PostgreSQL, certbot)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx postgresql postgresql-contrib certbot python3-certbot-nginx curl openssl
ok "paquetes instalados"

# ---------------------------------------------------------------------------------------------------------------
paso "2/8 Memoria extra (swap de 2 GB, para que compile Angular)"
if swapon --show | grep -q /swapfile; then
  ok "ya existía"
else
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  ok "swap activo"
fi

# ---------------------------------------------------------------------------------------------------------------
paso "3/8 Node 24 y pm2"
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
set +u # nvm no está escrito para modo estricto
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24 >/dev/null
nvm alias default 24 >/dev/null
set -u
command -v pm2 >/dev/null || npm install -g pm2 >/dev/null
ok "node $(node -v), pm2 $(pm2 -v)"

# ---------------------------------------------------------------------------------------------------------------
paso "4/8 Base de datos y .env de producción"
sudo mkdir -p "$DATOS_DIR/comprobantes" "$DATOS_DIR/respaldos"
sudo chown -R "$USER":"$USER" "$DATOS_DIR"
chmod 700 "$DATOS_DIR"

if [ -f "$ENV_FILE" ]; then
  ok "backend/.env ya existe: se conserva tal cual (secretos y contraseña de la base no cambian)"
else
  echo "Necesito unos datos (lo que escribas solo se guarda en backend/.env):"
  echo "  ¿Con qué se mandan los correos?"
  echo "    1) Gmail: tu cuenta de Gmail con una contraseña de aplicación (listo en un minuto)"
  echo "    2) Resend: no-reply@$DOMINIO (necesita el dominio verificado en Resend)"
  MAIL_OPCION=""
  while [[ "$MAIL_OPCION" != 1 && "$MAIL_OPCION" != 2 ]]; do read -rp "  Escribe 1 o 2: " MAIL_OPCION; done
  if [ "$MAIL_OPCION" = 1 ]; then
    GMAIL_USER=""
    while [[ "$GMAIL_USER" != *@* ]]; do read -rp "  Tu correo de Gmail: " GMAIL_USER; done
    GMAIL_PASS=""
    while [ -z "$GMAIL_PASS" ]; do read -rsp "  Contraseña de aplicación de Gmail (16 letras, no se ve al escribir): " GMAIL_PASS; echo; done
    GMAIL_PASS="${GMAIL_PASS// /}"
    MAIL_BLOQUE="MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$GMAIL_USER
SMTP_PASS=$GMAIL_PASS
MAIL_FROM_NAME=Partly
MAIL_FROM_ADDRESS=$GMAIL_USER"
  else
    RESEND_KEY=""
    while [[ "$RESEND_KEY" != re_* ]]; do read -rp "  Llave de Resend (empieza con re_): " RESEND_KEY; done
    read -rp "  Correo remitente [no-reply@$DOMINIO]: " MAIL_FROM
    MAIL_BLOQUE="MAIL_PROVIDER=resend
RESEND_API_KEY=$RESEND_KEY
MAIL_FROM_NAME=Partly
MAIL_FROM_ADDRESS=${MAIL_FROM:-no-reply@$DOMINIO}"
  fi
  GOOGLE_ID=""
  while [ -z "$GOOGLE_ID" ]; do read -rp "  GOOGLE_CLIENT_ID (el mismo que usas en tu computadora): " GOOGLE_ID; done
  GOOGLE_SECRET=""
  while [ -z "$GOOGLE_SECRET" ]; do read -rsp "  GOOGLE_CLIENT_SECRET (no se ve al escribir): " GOOGLE_SECRET; echo; done

  # Base de datos vacía, con una contraseña larga al azar que solo vive en el .env.
  DB_PASS="$(openssl rand -hex 24)"
  if pg psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='partly'" | grep -q 1; then
    pg psql -qc "ALTER USER partly WITH PASSWORD '$DB_PASS';"
  else
    pg psql -qc "CREATE USER partly WITH PASSWORD '$DB_PASS';"
  fi
  pg psql -tAc "SELECT 1 FROM pg_database WHERE datname='partly'" | grep -q 1 || pg createdb -O partly partly

  umask 077
  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
TRUST_PROXY=1
FRONTEND_URL=https://$DOMINIO
DATABASE_URL=postgresql://partly:$DB_PASS@localhost:5432/partly

JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
# Respáldala fuera del servidor: si se pierde, las credenciales guardadas no se pueden recuperar.
CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -hex 32)

GOOGLE_CLIENT_ID=$GOOGLE_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_SECRET
GOOGLE_CALLBACK_URL=https://$DOMINIO/api/auth/google/callback

RECEIPTS_DIR=$DATOS_DIR/comprobantes

$MAIL_BLOQUE
EOF
  umask 022
  ok "base de datos 'partly' y backend/.env creados (solo tú puedes leer el .env)"
fi

# ---------------------------------------------------------------------------------------------------------------
paso "5/8 Backend (tablas, compilación y arranque con pm2)"
cd "$REPO_DIR/backend"
npm ci --no-audit --no-fund
npx prisma generate >/dev/null
npx prisma migrate deploy
npm run build
if pm2 describe partly-api >/dev/null 2>&1; then
  pm2 restart partly-api --update-env >/dev/null
else
  pm2 start dist/main.js --name partly-api --cwd "$REPO_DIR/backend" >/dev/null
fi
pm2 save >/dev/null
# Que pm2 vuelva a levantar la API si el servidor se reinicia.
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3001/api/health/live >/dev/null 2>&1 && break
  sleep 2
done
if ! curl -fsS http://127.0.0.1:3001/api/health/live >/dev/null 2>&1; then
  pm2 logs partly-api --lines 30 --nostream || true
  falla "La API no arrancó. Mándame una captura de lo de arriba (no incluye contraseñas)."
fi
ok "API funcionando"

# ---------------------------------------------------------------------------------------------------------------
paso "6/8 Frontend (tarda unos minutos)"
cd "$REPO_DIR/frontend"
npm ci --no-audit --no-fund
NODE_OPTIONS=--max-old-space-size=2048 npx ng build
[ -f dist/frontend/browser/index.csr.html ] || falla "La compilación no generó index.csr.html."
ok "frontend compilado"

# ---------------------------------------------------------------------------------------------------------------
paso "7/8 nginx"
SITIO=/etc/nginx/sites-available/partly
sudo mkdir -p /etc/nginx/snippets
sudo cp "$REPO_DIR/frontend/nginx/security-headers.conf" /etc/nginx/snippets/partly-security-headers.conf
if [ -f "$SITIO" ] && grep -q "managed by Certbot" "$SITIO"; then
  ok "el sitio ya tiene HTTPS de certbot: no se reemplaza"
else
  sed "s#__DOMINIO__#$DOMINIO#g; s#__RAIZ__#$REPO_DIR/frontend/dist/frontend/browser#g" "$REPO_DIR/deploy/nginx-partly.conf" | sudo tee "$SITIO" >/dev/null
  sudo ln -sf "$SITIO" /etc/nginx/sites-enabled/partly
  sudo rm -f /etc/nginx/sites-enabled/default
fi
sudo nginx -t
sudo systemctl reload nginx
ok "nginx sirviendo la app en el puerto 80"

# ---------------------------------------------------------------------------------------------------------------
paso "8/8 Listo. Lo que falta (fuera de este script):"
cat <<EOF

  1. RESPALDA LA LLAVE DE CIFRADO. Corre esto y copia el valor a tu gestor de contraseñas:
       grep CREDENTIALS_ENCRYPTION_KEY $ENV_FILE

  2. DNS de $DOMINIO (donde está registrado el dominio):
       A   @     ->  IP de este servidor
       A   www   ->  IP de este servidor
       + si usas Resend: los registros que te dio (SPF, DKIM) y TXT _dmarc = v=DMARC1; p=none;

  3. Cuando http://$DOMINIO abra la página, activa HTTPS:
       sudo certbot --nginx -d $DOMINIO -d www.$DOMINIO

  4. En Google Cloud Console agrega el origen https://$DOMINIO y la redirección
       https://$DOMINIO/api/auth/google/callback

  5. Regístrate en https://$DOMINIO y vuélvete admin:
       cd $REPO_DIR/backend && BOOTSTRAP_ADMIN_EMAIL=tu-correo@gmail.com npm run admin:bootstrap -- --confirm

  6. Admin -> Correos -> "Enviar correo de prueba".

  Para actualizar después de cada push:  bash $REPO_DIR/deploy/actualizar.sh
EOF
