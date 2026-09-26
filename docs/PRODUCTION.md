# Salida a producción de Partly

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

Los logs de producción no deben contener tokens, contraseñas, CLABE completa, contenido de credenciales ni cuerpos de comprobantes.

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
- procedimiento de soporte y respuesta a incidentes.
