# Partly

Partly es una plataforma para organizar, compartir y comercializar suscripciones digitales. Conecta compradores, vendedores y proveedores; administra grupos y perfiles; registra pagos por transferencia; protege credenciales; calcula comisiones y ofrece herramientas de soporte y moderación.

## Estado del proyecto

El repositorio contiene una aplicación funcional en desarrollo activo:

- landing pública y autenticación local/Google;
- panel de compradores y vendedores;
- catálogo de plataformas, planes y grupos;
- aprobación administrativa de grupos y credenciales;
- pagos mediante comprobante, prorrateo y renovaciones;
- ganancias y comisiones de Partly;
- proveedores, inventario y compras al mayoreo;
- notificaciones, correo, reseñas e incidencias;
- panel administrativo y auditoría básica.

No existe todavía una pasarela bancaria automática. Los pagos y comisiones se comprueban mediante archivos y revisión humana.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Web | Angular 22, TypeScript 6, Tailwind CSS 4 |
| API | NestJS 12, TypeScript 6 |
| Datos | PostgreSQL 17, Prisma 5 |
| Autenticación | JWT, refresh tokens rotativos, Google OAuth 2 |
| Correo | Resend, Brevo, SMTP o transporte local `log` |
| Pruebas | Vitest/Angular y Jest |
| Producción | Docker Compose, Nginx y health checks |

## Estructura

```text
.
├── frontend/                 Aplicación Angular
├── backend/                  API NestJS y esquema Prisma
├── docs/PRODUCTION.md        Guía y lista de salida a producción
├── compose.production.yml    Stack reproducible de producción
└── .env.production.example   Variables requeridas por el stack
```

Los directorios `db-backups`, `asset-backups`, `brand-backups`, `backend/uploads` y los archivos `.env` son datos locales y están excluidos de Git.

## Desarrollo local

Requisitos:

- Node.js 22.12 o posterior;
- npm 10 o posterior;
- PostgreSQL 15 o posterior.

### 1. Backend

```bash
cd backend
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

La configuración local incluida usa:

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/api/docs`
- health: `http://localhost:3001/api/health/ready`

Completa los secretos y datos de PostgreSQL/Google en `backend/.env` antes de arrancar.

### 2. Frontend

En otra terminal:

```bash
cd frontend
npm ci
npm start
```

Abre `http://localhost:4200`. En desarrollo el frontend consume `http://localhost:3001/api`; en producción usa `/api` en el mismo origen.

## Comandos desde la raíz

Con las dependencias instaladas en ambas aplicaciones:

```bash
npm test       # todas las pruebas
npm run build  # ambas compilaciones de producción
npm run verify # pruebas y compilaciones
```

También existen `npm run start:backend` y `npm run start:frontend` para desarrollo.

## Flujo principal

1. Un vendedor crea un grupo a partir de un plan del catálogo.
2. Administración revisa la publicación, credenciales y comisión propuesta.
3. Los compradores reservan un lugar; al comenzar el grupo se generan sus cobros.
4. Cada comprador transfiere al vendedor y sube su comprobante.
5. El vendedor o un administrador valida el pago; la membresía obtiene acceso a las credenciales cifradas.
6. Partly registra ingreso bruto, comisión y neto del vendedor.
7. Las comisiones exigibles se agrupan en cargos que el vendedor paga a Partly.
8. Las tareas programadas gestionan renovaciones, vencimientos, recordatorios y correo.

El módulo de mayoreo permite que usuarios autorizados compren cuentas completas a proveedores y las conviertan posteriormente en grupos.

## Seguridad relevante

- Contraseñas con Argon2.
- Access tokens de corta duración y refresh tokens rotativos/revocables.
- Credenciales compartidas y cuentas de retiro (CLABE o tarjeta de débito) cifradas con AES-256-GCM.
- Validación estricta de DTO, rate limiting, Helmet y CORS.
- Los administradores solo pueden leer las credenciales de un grupo mientras las revisan (enviadas y sin aprobar), y cada consulta queda en la bitácora.
- La cuenta bancaria del vendedor solo la ven él, un administrador y quien le debe un pago; la comisión pactada, solo el vendedor y Partly. Los grupos sin aprobar no son públicos.
- Los comprobantes se validan por su contenido real (JPG, PNG, WEBP o PDF), no solo por la extensión.
- La app web se sirve con cabeceras de seguridad (CSP sin scripts en línea, HSTS, protección contra iframes); ver `frontend/nginx/security-headers.conf`.
- En producción se exige HTTPS, secretos JWT de al menos 32 caracteres y correo real.
- Swagger se desactiva de forma predeterminada en producción.

La llave `CREDENTIALS_ENCRYPTION_KEY` debe respaldarse en un gestor de secretos. Perderla hace irrecuperables las credenciales cifradas.

## Documentación

- [API y backend](backend/README.md)
- [Analítica de la landing](docs/ANALYTICS.md)
- [Modelo de base de datos](backend/DATABASE.md)
- [Salida a producción](docs/PRODUCTION.md)
- Swagger local: `/api/docs`

## Verificación continua

El workflow `.github/workflows/ci.yml` instala dependencias con `npm ci`, genera Prisma, ejecuta las pruebas y compila frontend y backend en cada push y pull request.

## Pendientes antes de operar con usuarios reales

- configurar dominio, TLS, DNS y Google OAuth verificado;
- usar PostgreSQL administrado o automatizar respaldos/restauraciones;
- mover recibos a almacenamiento persistente de objetos si se ejecutan varias réplicas;
- conectar y verificar un proveedor real de correo;
- definir políticas legales, fiscales, de reembolsos y tratamiento de datos;
- ejecutar pruebas end-to-end sobre los flujos de pago y renovación;
- configurar monitoreo, alertas, rotación de secretos y respuesta a incidentes.

La lista operativa completa está en [docs/PRODUCTION.md](docs/PRODUCTION.md).
