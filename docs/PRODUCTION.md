# Salida a producción de Tequio

Esta guía convierte el repositorio en un despliegue reproducible, pero no sustituye la revisión legal, financiera y de seguridad correspondiente al país donde opere el servicio.

## Arquitectura recomendada

```text
Internet
   │ HTTPS
CDN / proxy con TLS
   │
Nginx (frontend Angular + proxy /api)
   │
NestJS ───── PostgreSQL
   │
almacenamiento persistente de comprobantes
   │
proveedor de correo
```

`compose.production.yml` implementa esta arquitectura en una sola máquina, excepto TLS y correo externo. Para alta disponibilidad, usa PostgreSQL administrado, almacenamiento de objetos y varias réplicas del backend detrás de un balanceador.

## Servidor propio sin Docker (Lightsail)

Es la opción elegida para el servidor de `tequio.com.mx` (Amazon Lightsail). Docker Compose (secciones siguientes) queda como alternativa; no mezcles las dos en el mismo servidor. Para un solo servidor Debian/Ubuntu con nginx + pm2 + PostgreSQL local están los scripts de `deploy/`:

1. Entra por SSH con tu propia llave y deja abiertos solo 22 (tu IP), 80 y 443.
2. `sudo apt install -y git`, clona el repo en `/var/www/partly` (repo privado: usuario + token de GitHub).
3. `cd /var/www/partly && bash deploy/instalar-servidor.sh` — instala paquetes, swap, Node 24 y pm2, crea la base vacía y el `backend/.env` con secretos nuevos (pregunta la llave de Resend y los datos de Google), aplica migraciones, compila, arranca la API con pm2 y configura nginx (`deploy/nginx-partly.conf`). Al final imprime lo que falta: respaldar la llave de cifrado, DNS, `certbot`, Google y el primer admin.
4. Después de cada push: `bash /var/www/partly/deploy/actualizar.sh` (respalda la base en `/var/www/partly-datos/respaldos`, migra, recompila y reinicia).

Los comprobantes viven fuera del repo, en `/var/www/partly-datos/comprobantes`. El dominio se toma de `DOMINIO` (por omisión `tequio.com.mx`).

## 1. Secretos y variables

```bash
cp .env.production.example .env.production
```

Reemplaza todos los ejemplos. Generación sugerida:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Usa salidas diferentes para:

- `JWT_ACCESS_SECRET`;
- `JWT_REFRESH_SECRET`;
- `POSTGRES_PASSWORD`;
- `CREDENTIALS_ENCRYPTION_KEY` (la salida hexadecimal de 64 caracteres).

Reglas de producción aplicadas al arrancar:

- `FRONTEND_URL` y `GOOGLE_CALLBACK_URL` deben usar HTTPS;
- los secretos JWT deben tener al menos 32 caracteres;
- `CREDENTIALS_ENCRYPTION_KEY` debe ser hexadecimal y medir 64 caracteres;
- `MAIL_PROVIDER=log` está prohibido;
- Resend, Brevo o SMTP deben incluir sus credenciales;
- `MAIL_FROM_ADDRESS` es obligatorio.

Guarda los secretos en el servicio de secretos del proveedor, no en imágenes, logs ni Git.

## 2. Dominio, proxy y Google

1. Apunta el dominio al balanceador o servidor.
2. Termina TLS con un certificado válido.
3. Conserva los encabezados `X-Forwarded-*`.
4. Ajusta `TRUST_PROXY` al número real de proxies confiables. No uses un número mayor sin conocer la topología.
5. Registra exactamente `https://tu-dominio/api/auth/google/callback` en Google Cloud.
6. Publica y verifica la pantalla de consentimiento de OAuth.

El contenedor Nginx escucha HTTP porque se espera que TLS termine delante. Nunca expongas ese puerto directamente a Internet sin TLS.

### Cabeceras de seguridad

La app web debe servirse con las cabeceras de `frontend/nginx/security-headers.conf` (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`). El contenedor ya las incluye. Si publicas con un Nginx instalado directamente en el servidor, copia ese archivo y agrégalo con `include` dentro del bloque `server` **y** dentro de cada `location` que tenga su propio `add_header` (Nginx no los hereda).

La CSP no permite scripts en línea: no agregues `<script>` con código dentro de `index.html`; usa un archivo en `frontend/public/`. Si la app empieza a cargar recursos de otro dominio (fuentes, imágenes, analítica), agrégalo a la directiva correspondiente o el navegador lo bloqueará.

## 3. Correo

Configura Resend, Brevo o SMTP con un dominio verificado. Publica SPF, DKIM y, preferentemente, DMARC. Antes del lanzamiento:

1. abre Admin → Correos;
2. envía un mensaje de prueba;
3. confirma entrega, remitente y enlaces;
4. prueba recuperación de contraseña;
5. configura alertas por mensajes `FAILED`.

## 4. Base de datos

Para el primer arranque con Docker Compose:

```bash
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
```

El servicio `migrate` ejecuta `prisma migrate deploy` una vez antes del backend. Si falla, el backend no comienza.

Antes de cada despliegue posterior:

1. crea y verifica un respaldo;
2. revisa el SQL de migraciones nuevas;
3. despliega una versión identificable por commit/tag;
4. ejecuta las migraciones una sola vez;
5. verifica `/api/health/ready` y los flujos críticos.

Nunca uses `prisma migrate dev` ni `prisma db push` en producción.

## 5. Primer administrador

Registra primero una cuenta normal. Después, dentro de un entorno seguro con acceso a producción:

```bash
cd backend
BOOTSTRAP_ADMIN_EMAIL=admin@tu-dominio.com npm run admin:bootstrap -- --confirm
```

El script solo funciona si todavía no existe un administrador activo y deja una entrada de auditoría. Los administradores posteriores se asignan desde el panel.

## 6. Comprobantes y archivos

Compose monta el volumen `receipt-data`. Inclúyelo en respaldos y limita el acceso al proceso del backend.

Para más de una réplica, el disco local no es suficiente: migra los comprobantes a almacenamiento de objetos privado con cifrado, URLs firmadas, política de retención y análisis antimalware. No publiques `RECEIPTS_DIR` como carpeta estática.

## 7. Observabilidad

Supervisa como mínimo:

- `/api/health/live` para reiniciar procesos bloqueados;
- `/api/health/ready` para sacar instancias sin base de datos del balanceador;
- tasa de errores HTTP 5xx y latencia p95;
- conexiones, CPU, disco y espacio de PostgreSQL;
- fallos de correo y tamaño del outbox;
- ejecuciones de cron, pagos/comisiones vencidos y órdenes sin atender;
- espacio y antigüedad de comprobantes;
- inicios de sesión fallidos y eventos administrativos.

Los logs de producción no deben contener tokens, contraseñas, números completos de cuentas bancarias, contenido de credenciales ni cuerpos de comprobantes.

La landing incluye una capa neutral para eventos de conversión y Web Vitals, pero no instala un proveedor ni cookies. Antes de habilitar la recolección externa, completa la revisión de consentimiento, privacidad, CSP y retención descrita en [ANALYTICS.md](ANALYTICS.md). No envíes PII en eventos.

## 8. Respaldos

- PostgreSQL: respaldo cifrado diario y recuperación a un punto en el tiempo si el proveedor lo permite.
- Recibos: copia coordinada con la base de datos.
- Secretos: respaldo separado y con acceso restringido, en especial la llave de cifrado.
- Retención: define una política legal y elimina datos vencidos.
- Restauración: prueba al menos mensualmente en un entorno aislado.

Un respaldo no se considera válido hasta que se restaura y verifica.

## 9. Verificación previa

```bash
npm run verify
docker compose --env-file .env.production -f compose.production.yml config
```

Checklist funcional:

- registro local, verificación y recuperación de contraseña;
- login de Google y rotación de refresh token;
- creación, aprobación, llenado e inicio de un grupo;
- carga, rechazo y aprobación de comprobante;
- acceso y rotación de credenciales;
- renovación automática y salida sin renovación;
- generación, pago y rechazo de comisión;
- solicitud, compra, entrega y vencimiento de mayoreo;
- incidencia y conversación entre participantes;
- notificaciones y preferencias;
- exportación/cancelación de cuenta;
- permisos de usuario, vendedor, proveedor y administrador.

Checklist web público:

- confirmar que `/`, `/como-funciona-el-ciclo`, `/seguridad`, `/terminos` y `/privacidad` entreguen HTML prerenderizado;
- confirmar que `/comparativa`, autenticación, panel y administración carguen el shell cliente correcto;
- el dominio final es `https://tequio.com.mx` (ya puesto en `index.html`); validar canonical, Open Graph, Twitter y datos estructurados;
- revisar teclado, foco visible, zoom al 200 %, lector de pantalla y movimiento reducido;
- medir LCP, CLS e INP en móvil y escritorio con el dominio, CDN y API reales;
- validar eventos de conversión sin información personal;
- reemplazar o retirar métricas, testimonios y enlaces sociales demostrativos pendientes.

## 10. Despliegue y reversión

Despliega imágenes etiquetadas con el hash del commit. Conserva al menos la versión anterior.

Para una reversión:

1. detén tráfico o activa mantenimiento si hay riesgo de escrituras incompatibles;
2. vuelve a la imagen anterior;
3. no reviertas migraciones destructivas automáticamente;
4. restaura un respaldo solo después de evaluar pérdida de datos;
5. documenta el incidente y valida pagos, comisiones y credenciales.

Diseña migraciones compatibles hacia delante: primero agrega, luego despliega código, migra datos y solo en una versión posterior elimina columnas antiguas.

## Criterio de lanzamiento

No abras el servicio a usuarios reales hasta tener:

- CI verde en el commit desplegado;
- dominio/TLS y OAuth verificados;
- correo real confirmado;
- respaldo y restauración probados;
- almacenamiento persistente y privado;
- monitoreo y alertas con responsable;
- revisión legal de términos, privacidad, reembolsos, fiscalidad y manejo de credenciales;
- prueba end-to-end completa con cuentas de ensayo;
- dominio público real reflejado en canonical, metadatos sociales y datos estructurados;
- analítica y consentimiento aprobados, o decisión documentada de operar sin proveedor;
- datos comerciales, testimonios y métricas demostrativas reemplazados o retirados;
- procedimiento de soporte y respuesta a incidentes.
