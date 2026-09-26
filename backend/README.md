# Vakeva API

API de Vakeva construida con NestJS, Prisma y PostgreSQL. Centraliza identidad, catálogo, grupos, pagos por transferencia, credenciales cifradas, comisiones, proveedores, notificaciones, correo y soporte.

## Inicio rápido

Requiere Node.js 22.12+ y PostgreSQL 15+.

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Con la configuración local recomendada:

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/api/docs`
- disponibilidad del proceso: `GET /api/health/live`
- disponibilidad de PostgreSQL: `GET /api/health/ready`

## Arquitectura

```text
src/
├── common/       guards, filtros, decoradores y utilidades
├── config/       configuración tipada y validación de entorno
├── prisma/       acceso global a PostgreSQL
└── modules/
    ├── auth/             identidad, Google OAuth y sesiones
    ├── users/            perfil, privacidad y administración
    ├── categories/       categorías del catálogo
    ├── platforms/        servicios como Netflix o Spotify
    ├── plans/            variantes, cupos, periodos y comisión
    ├── groups/           publicaciones, membresías y credenciales
    ├── payments/         comprobantes, prorrateo y renovaciones
    ├── commissions/      ganancias y cobros de Vakeva
    ├── wallet/           libro histórico de saldo
    ├── payouts/          retiros heredados del primer flujo financiero
    ├── providers/        proveedores y mercado de mayoreo
    ├── notifications/    avisos dentro de la aplicación
    ├── reviews/          reputación y respuesta del vendedor
    ├── support/          incidencias y conversaciones
    ├── mail/             outbox y transportes de correo
    ├── admin/            métricas administrativas
    └── health/           liveness y readiness
```

La lógica vive en servicios; los controladores validan acceso y exponen DTO documentados en Swagger. `PrismaExceptionFilter`, `ValidationPipe` y `ClassSerializerInterceptor` se aplican globalmente.

## Autenticación y seguridad

- Registro y login emiten un access token y un refresh token.
- Google OAuth usa un código de intercambio de un solo uso; no coloca tokens en la URL.
- Los refresh tokens se guardan como hash SHA-256 y rotan en cada renovación.
- La reutilización de un token ya rotado revoca las sesiones del usuario.
- Las contraseñas se almacenan con Argon2.
- Las credenciales de servicios y la CLABE de retiro se cifran con AES-256-GCM.
- La cuenta se revalida en cada solicitud autenticada.
- Existen rate limiting, Helmet, CORS explícito y validación global con lista blanca.

## Familias de endpoints

Todas las rutas usan `/api`. `🔒` requiere JWT y `ADMIN` requiere además rol administrativo.

| Prefijo | Acceso | Responsabilidad |
|---|---|---|
| `/auth` | público/🔒 | registro, login, Google, refresh, recuperación y logout |
| `/users` | 🔒/ADMIN | perfil, preferencias, sesiones, exportación ARCO y roles |
| `/categories`, `/platforms`, `/plans` | lectura pública, escritura ADMIN | catálogo administrado |
| `/groups` | mixto | marketplace, propiedad, membresías, perfiles y credenciales |
| `/groups/:id/payments` | 🔒 | comprobantes del comprador y revisión del vendedor |
| `/admin/payments` | ADMIN | monitor y recordatorios manuales de pago |
| `/earnings` | 🔒 | resumen e historial de ganancias del vendedor |
| `/commissions` | 🔒 | deuda, comprobante y estado de comisiones |
| `/admin/commissions` | ADMIN | revisión y cuenta bancaria de Vakeva |
| `/provider-profiles`, `/provider-listings` | 🔒/ADMIN | proveedores e inventario de mayoreo |
| `/provider-orders` | 🔒 | compra, comprobante, entrega, renovación y reposición |
| `/wholesale-access` | 🔒/ADMIN | autorización para comprar al mayoreo |
| `/incidents` | 🔒/ADMIN | soporte para membresías y órdenes de proveedor |
| `/notifications` | 🔒 | consulta y lectura de avisos |
| `/groups/:id/review[s]` | mixto | reseñas y respuesta pública del vendedor |
| `/admin/mail` | ADMIN | estado, outbox, reintento y correo de prueba |
| `/admin/dashboard` | ADMIN | métricas operativas |
| `/health` | público | estado del proceso y PostgreSQL |

Swagger contiene el contrato detallado de cada operación y DTO.

## Ciclo de grupos y pagos

### Publicación y arranque

1. El vendedor crea un grupo desde un `Plan`.
2. El grupo queda sujeto a aprobación administrativa.
3. Los compradores reservan lugares mientras se alcanza el mínimo de arranque.
4. El vendedor carga credenciales; administración puede solicitarlas y aprobarlas.
5. El vendedor inicia el grupo cuando cumple las condiciones.

`GroupStatus` representa el ciclo comercial y `GroupApprovalStatus` la moderación. Son estados independientes.

### Cobro

- Antes de iniciar existen reservas; después se generan membresías y cobros del ciclo.
- Una entrada a mitad de ciclo se prorratea y exige un mínimo de días restantes.
- El comprador transfiere al vendedor y sube un comprobante.
- El vendedor o administración acepta o rechaza el comprobante.
- El acceso a credenciales requiere una membresía autorizada.
- `autoRenew=false` libera el lugar al terminar el periodo; puede existir una reserva para el ciclo siguiente.

No hay cargo automático a tarjeta. `PaymentMethod` y `Wallet` permanecen por compatibilidad con el diseño financiero inicial, pero el flujo operativo vigente usa transferencias y comprobantes.

### Ganancias y comisión

Cada pago validado crea un `EarningEntry` con bruto, porcentaje, comisión y neto. El dinero llega directamente al vendedor; Vakeva agrupa comisiones exigibles en `CommissionCharge`. El vendedor transfiere la comisión, carga comprobante y administración lo valida.

Una comisión vencida puede restringir operaciones del vendedor hasta su regularización.

## Credenciales y privacidad

`Credential` contiene solamente valores cifrados. `CredentialHistory` registra quién realizó un cambio sin conservar contraseñas anteriores. Un administrador no obtiene acceso automático al texto descifrado: debe ser propietario o miembro válido conforme a las reglas del grupo.

La llave `CREDENTIALS_ENCRYPTION_KEY` debe tener 64 caracteres hexadecimales y vivir en un gestor de secretos. Su rotación exige un procedimiento de recifrado; no se debe reemplazar directamente.

## Proveedores y mayoreo

Un usuario puede solicitar un perfil de proveedor. Los proveedores aprobados publican `ProviderListing` asociados a planes existentes. Un comprador con `WholesaleAccess` autorizado crea una orden, transfiere a Vakeva, sube comprobante y recibe credenciales cifradas tras la entrega.

Las órdenes soportan vencimiento, renovación, reposición, cancelación, reembolso manual y creación de un grupo resultante.

## Tareas programadas

| Frecuencia | Trabajo |
|---|---|
| cada minuto | procesa la cola de correo |
| cada hora | cancela órdenes de mayoreo impagadas y avisa vencimientos |
| medianoche | pagos, renovaciones, periodos de gracia y limpieza de recibos |
| medianoche | facturación, avisos y restricciones por comisión |
| 02:00 | elimina correos antiguos terminados |
| 10:00 | recuerda iniciar grupos listos |
| 11:00 | solicita reseñas elegibles |

Las horas usan la zona configurada en el proceso/contenedor; producción debe fijar y documentar su zona horaria.

## Correo

Todos los mensajes pasan primero por `EmailMessage` (patrón outbox), lo que permite deduplicar, reintentar y auditar el resultado. Hay transportes `log`, `resend`, `brevo` y `smtp`.

En `NODE_ENV=production`, la validación rechaza `log` y exige remitente y credenciales del proveedor seleccionado.

## Variables de entorno

Consulta `.env.example`. Las variables críticas son:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | conexión PostgreSQL |
| `FRONTEND_URL` | origen CORS exacto |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | protección de sesiones |
| `GOOGLE_*` | OAuth de Google |
| `CREDENTIALS_ENCRYPTION_KEY` | cifrado AES-256-GCM |
| `RECEIPTS_DIR` | almacenamiento persistente de comprobantes |
| `MAIL_PROVIDER` y variables del proveedor | correo real |
| `TRUST_PROXY` | saltos de proxy confiables delante de Nest |
| `SWAGGER_ENABLED` | publicación de `/api/docs` |

En producción se exige HTTPS, secretos JWT de 32+ caracteres y transporte real de correo. Swagger queda apagado salvo activación explícita.

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm test
npm run test:cov
npm run prisma:migrate
npm run prisma:migrate:deploy
npm run prisma:studio
```

## Base de datos y producción

El esquema canónico es `prisma/schema.prisma`. Nunca se edita una migración ya aplicada. Desarrollo usa `prisma migrate dev`; producción usa exclusivamente `prisma migrate deploy`.

Consulta [DATABASE.md](DATABASE.md) para el inventario y las reglas de integridad. La guía operativa se encuentra en [`docs/PRODUCTION.md`](../docs/PRODUCTION.md).
