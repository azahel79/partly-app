# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Partly: marketplace para compartir suscripciones (Netflix, Spotify…). Un vendedor publica un **grupo** (cuenta con varios perfiles), los compradores pagan su **cupo** por transferencia **directo al vendedor** y suben un comprobante; el vendedor lo aprueba y el comprador ve las credenciales. Partly cobra al vendedor una comisión fija del 9% por cada pago validado (o una reducida que el admin le autorice por reputación) y vende cuentas completas "al mayoreo". Monorepo: `frontend/` (Angular 22) y `backend/` (NestJS 12 + Prisma 5 + PostgreSQL).

**Todo texto visible al usuario va en español** (comentarios de código también). En la interfaz no se usa la palabra "prorrateo": se dice "pagas solo los días que faltan".

## Comandos

Desde la raíz: `npm test` (ambos), `npm run build` (ambos), `npm run verify` (pruebas + builds), `npm run start:backend`, `npm run start:frontend`.

Backend (`cd backend`):
- `npm run start:dev` — API en `http://localhost:3001/api` (puerto de `.env`), Swagger en `/api/docs`.
- `npm test` — Jest; los specs viven en `backend/test/*.spec.ts`. Una prueba: `npx jest test/billing.util.spec.ts` o `npx jest -t "nombre del caso"`.
- `npm run lint` — ESLint con `--fix`.
- `npx prisma migrate dev --name <nombre>` — nueva migración; `npx prisma generate` tras cambiar `prisma/schema.prisma`. En Windows `generate` falla con EPERM si la API está corriendo (bloquea el motor): deténla primero.
- `npm run admin:bootstrap -- --confirm` con `BOOTSTRAP_ADMIN_EMAIL` — convierte en ADMIN a una cuenta ya registrada (solo si aún no hay admin).

Frontend (`cd frontend`):
- `npm start` — `ng serve` en `http://localhost:4200`, consume `http://localhost:3001/api`.
- `npx ng test --watch=false` — Vitest (builder `@angular/build:unit-test`); una prueba: `npx ng test --watch=false --include src/app/ruta/archivo.spec.ts` (o `--filter "nombre"`).
- `npx ng build` — producción (`dist/frontend/browser`); `--configuration development` para compilar rápido y ver errores.

CI (`.github/workflows/ci.yml`): `npm ci`, `prisma generate`, pruebas y builds de ambos en cada push.

Pruebas de extremo a extremo de cobros y renovaciones: skill `prueba-renovacion` (scripts en `backend/scripts/qa/`).

## Arquitectura del backend

- Un módulo por dominio en `backend/src/modules/` (groups, payments, commissions, providers, reviews, notifications, mail, support, users, auth…). La lógica vive en los servicios; los controladores solo validan acceso. `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`: todo campo de entrada necesita decoradores de class-validator en su DTO.
- Respuestas: DTOs con `@Exclude()`/`@Expose()` que se construyen a mano (`new GroupResponseDto(entidad)`); el `ClassSerializerInterceptor` global solo emite lo marcado con `@Expose`.
- **Concurrencia en dinero:** las transiciones de estado (aprobar un pago, un cobro, una orden) usan `updateMany` con el estado esperado en el `where` dentro de `$transaction` y fallan si afectan 0 filas. Sigue ese patrón en cualquier acción que se pueda disparar dos veces.
- **Notificaciones:** `NotificationsService.create(tx, {...})` se llama dentro de la transacción del cambio. Qué avisos salen también por correo lo decide `modules/notifications/email-rules.ts`; los correos pasan por una bandeja (`EmailMessage`) que se despacha cada minuto, con `emailDedupeKey`, `emailImmediate` y horario silencioso de 21:00 a 8:00 (CDMX). En desarrollo `MAIL_PROVIDER=log` (se ven en Admin > Correos); en producción se exige un proveedor real.
- **Tareas programadas (`@Cron`)** — el orden importa:
  - `PaymentsService.processDailyBilling` (medianoche): vencer pagos sin comprobante tras su gracia → cerrar membresías que no renuevan → dar el lugar a quien lo apartó → cerrar/abrir ciclos → generar cobros de renovación → recordatorios → limpiar comprobantes viejos.
  - `CommissionsService.processDaily`, `GroupsService.sendStartReminders` (10:00), `ReviewsService.sendReviewReminders` (11:00), `ProviderOrdersService.processHourly`.
- Credenciales de cuentas y CLABE se cifran con AES-256-GCM (`common/utils/crypto.util.ts`, llave `CREDENTIALS_ENCRYPTION_KEY`; perderla las vuelve irrecuperables).
- `wallet` y `payouts` son del esquema financiero anterior; ningún flujo actual los usa.

## Reglas de negocio que atraviesan varios archivos

- **Alta de grupo, en este orden** (lo impone el backend): vendedor crea (PENDING, ya con su comisión) → admin pide credenciales → vendedor las envía (antes responde 403) → admin aprueba.
- **Duración y tipo de acceso:** el vendedor elige cada cuánto se cobra (`Plan.billingPeriod`: 1, 2, 3, 6 o 12 meses; en el frontend, textos con `shared/billing-period.util.ts`, nunca "/mes" fijo). Solo YouTube, Spotify y Canva (`supportsInviteLink`) pueden dar acceso con **invitación al grupo familiar** (`Group.accessType = INVITE_LINK`): la credencial guarda solo `inviteLink` y el miembro ve "Unirme al grupo familiar"; al salir alguien, el aviso pide sacarlo del grupo familiar en lugar de cambiar la contraseña.
- **Comisión:** fija del 9% (`DEFAULT_COMMISSION_PCT` en `commissions.constants.ts`) salvo que el vendedor tenga `User.commissionRate`. La pide desde Comisiones si cumple requisitos (30 pagos validados, calificación ≥4.5 con 5 reseñas, sin comisiones vencidas en 90 días); el admin la aprueba (mínimo 6%) y se copia a `Group.commissionPercentage` de todos sus grupos. Cada `EarningEntry` guarda el % con el que se calculó, así que cambiarla no toca pagos pasados (`CommissionRatesService`).
- **Membresías:** `RESERVED` (apartó sin pagar) → `PENDING_PAYMENT` → `ACTIVE`; `CANCELLED` al salir o no pagar. Soltar un lugar (`POST /groups/:id/leave`) borra sus cobros pendientes sin comprobante y se bloquea si hay uno en revisión. Quien ya pagó y sale lo pierde de inmediato y sin reembolso (el dinero nunca pasó por Partly), por eso "Salir del grupo" en Mis grupos le ofrece primero "salir al terminar mi periodo" (apaga `autoRenew`). Antes de apartar se revisa si ya tiene lugar en otro grupo de la misma plataforma (`GET /groups/:id/similar-membership`); "cambiarme a este" (`join` con `switchFromGroupId`) suelta el otro lugar solo si no lo ha pagado. `Group.occupiedSlots` cuenta solo pagados y se ajusta en la aprobación del primer pago y en cada cancelación. El grupo puede iniciar con 75% de cupos apartados (`slotsRequiredToStart`); al iniciar, cada reservado tiene 48 h para pagar.
- **Entrada a un grupo ya iniciado:** solo si quedan `minEntryDays` (15 en mensual, mitad del ciclo en los demás) y se paga solo lo que resta (`computeJoinPricing` en `common/utils/billing.util.ts`).
- **Renovación por adelantado:** 3 días antes del corte se crea un `Payment` con `forNextCycle=true` colgado del ciclo en curso, solo para miembros con `autoRenew=true`. Gracia de 48 h después del corte; un comprobante ya subido protege el lugar. Quien apaga la renovación libera su lugar al terminar el periodo; otro comprador puede apartarlo sin pagar (`common/utils/seats.util.ts`, `stage=freeing` en el marketplace).
- **Grupos de una cuenta de mayoreo:** si la cuenta (`Group.sourceProviderOrder.expiresAt`) no cubre casi todo el siguiente periodo (`wholesaleCoversNextPeriod`, margen de 7 días), no se generan cobros de renovación ni el grupo pasa al siguiente ciclo en el corte; el vendedor recibe un aviso y un banner en su grupo, y los miembros un aviso al vencer. Al renovar o reponer la cuenta, el proceso de medianoche sigue normal. Vencida, el grupo sale del marketplace y no acepta miembros nuevos.
- **Acceso de las cuentas de mayoreo:** Partly las entrega con credenciales o **por panel** (`ProviderOrderCredential.panelUrl`, con usuario y contraseña del panel opcionales). Con credenciales, la contraseña es de Partly: al publicarla se copia al grupo, el vendedor no puede cambiarla (`upsertCredential` responde 403; pide el cambio con un reporte) y Partly la actualiza desde Mi tienda (`PUT /provider-orders/:id/credential`), que la copia al grupo, avisa a los miembros y deja la respuesta en los reportes abiertos de esa cuenta o de su grupo (pasan a revisión). Por panel, el acceso del grupo lo pone y cambia el vendedor.
- **Dinero:** cada pago aprobado crea un `EarningEntry` (bruto/comisión/neto); las entradas se agrupan en un `CommissionCharge` que el vendedor paga con comprobante. Comisión vencida ⇒ sus grupos salen del marketplace y no puede crear/iniciar grupos ni comprar al mayoreo (sus miembros actuales no se tocan).
- **Salidas y contraseña:** si sale alguien que ya había pagado (no pagó su renovación, no renovó o se salió), el vendedor recibe `MEMBER_LEFT` pidiéndole cambiar la contraseña, y en su grupo ve "cambio de contraseña pendiente" (`GET /groups/:id/credential-status`: salidas con pago posteriores a `Credential.updatedAt`). Al guardar un usuario o contraseña nuevos en un grupo aprobado, los miembros activos reciben `CREDENTIAL_UPDATED` (sin la contraseña).
- **Soporte (incidencias):** el comprador reporta a su vendedor (grupo) y el vendedor a Partly (compra de mayoreo). Solo quien reportó o un admin la dan por resuelta; escalada, solo el admin la mueve. Partly puede escribir en privado a una de las partes (`IncidentMessage.audience`) y pedirle respuesta al vendedor en 24 h (`request-response`); `IncidentsService.processFollowUps` (cada hora) le recuerda al vendedor a las 24 h sin respuesta, la escala sola a las 72 h y avisa a Partly si venció el plazo que pidió.
- **Reseñas:** solo con un pago validado y 7 días de servicio; el vendedor responde, no borra.
- Fechas de renovación a medianoche UTC; el frontend las muestra con `timeZone: 'UTC'` para no correrse un día en México.

## Reglas de seguridad que no hay que romper

- `GroupResponseDto.restrictTo(...)`: la cuenta bancaria del vendedor solo la ven él, un ADMIN y quien le debe un pago; la comisión, solo el vendedor y un ADMIN. `GET /groups/:id` usa `OptionalJwtAuthGuard` y no muestra grupos sin aprobar a extraños.
- Un ADMIN solo lee credenciales de un grupo mientras están en revisión (`credentialReviewStatus = SUBMITTED`) y cada lectura se registra en `AdminActionLog`.
- Todo comprobante subido pasa por `receiptMatchesType` (valida el contenido, no solo el tipo declarado).
- La web se sirve con la CSP de `frontend/nginx/security-headers.conf`, que **prohíbe scripts en línea**: no agregues `<script>` con código en `index.html` (usa un archivo en `frontend/public/`, como `theme-init.js`) y registra ahí cualquier dominio externo nuevo.

## Arquitectura del frontend

- Componentes standalone con signals y control flow `@if/@for`; rutas perezosas en `src/app/app.routes.ts`. Áreas: `landing/` (público), `auth/`, `panel/` (comprador y vendedor comparten panel, protegido por `authGuard`) y `admin/` (`adminGuard`).
- Servicios HTTP en `src/app/shared/*.service.ts`: envuelven `HttpClient` y convierten errores a un mensaje en español con `toErrorMessage`, así los componentes reciben `string` en el `error` de `subscribe`. La URL base está en `shared/api-config.ts` (dev: `localhost:3001/api`; prod: `/api` en el mismo dominio). El interceptor de auth agrega el token y renueva la sesión en 401; las claves de `localStorage` empiezan con `partly.`.
- Estilos: Tailwind 4 con tokens propios (`pink` es el verde de la marca `#059669`, `ink`, `crema-*`). El modo oscuro aplica solo a panel y admin: clase `dark` en `<html>` más los tokens de `src/dark-theme.css`; los estilos de componentes usan `:host-context(html.dark)`.
- Estilo común de panel y admin en `src/app-ui.css` (la landing no lo usa): fondo `#F6F7F9`, tarjetas blancas con borde fino, verde `#047857` solo en la acción principal, textos de 12 px como mínimo y un solo tamaño de título. Piezas reutilizables: `ui-btn` (`--primary`, `--secondary`, `--sm`), `ui-link`, `ui-pill` (`--ok` en orden, `--warn` le toca hacer algo, `--info` esperando a alguien, `--danger` vencido o rechazado, `--violet` próximo ciclo), `ui-metric`, `ui-chip`, `ui-input`, `ui-seats` (barra de lugares, con `shared/seat-bar.util.ts`) y `ui-skeleton` en lugar de "Cargando…". Dinero siempre con `{{ monto | money }}` o `formatMoney()` de `shared/money.ts`; estado de un grupo para su vendedor con `shared/status-tag.util.ts`.
- Confirmaciones simples ("¿Seguro?") con `ConfirmService` (SweetAlert2). Acciones con formulario o una decisión importante (entregar credenciales, revisar un pago) van en un modal `shared/ui-modal` (`app-ui-modal`, estilos `ui-modal`/`ui-field`/`ui-summary`/`ui-note` en `app-ui.css`): se cierra con Esc o tocando fuera, pregunta antes de descartar lo escrito (`dirty`) y en celular sale como hoja desde abajo. Lo que solo se consulta (ver credenciales) se despliega en línea. Logos de plataformas: `shared/platform-logo` + `platform-logo.util.ts` (archivos en `public/logos`, con respaldo genérico verde).
