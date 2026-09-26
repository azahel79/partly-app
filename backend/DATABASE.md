# Base de datos de Vakeva

Documento funcional del esquema PostgreSQL administrado con Prisma. La fuente canónica es [`prisma/schema.prisma`](prisma/schema.prisma); si este documento y el esquema difieren, prevalece el esquema.

Estado documentado: 32 modelos, 21 enums y 31 migraciones.

## Convenciones

- Las claves primarias son UUID, salvo `PlatformSettings.id` y `WholesaleAccess.userId`.
- Prisma usa nombres `camelCase`; PostgreSQL usa `snake_case` mediante `@map`/`@@map`.
- Los importes usan `Decimal(10,2)` y los porcentajes `Decimal(5,2)`.
- Las fechas se guardan como `DateTime`; la aplicación calcula periodos en UTC.
- Los secretos nunca se almacenan en texto plano: contraseñas usan Argon2, tokens usan hash y credenciales/CLABE usan AES-256-GCM.
- Los archivos de comprobantes viven fuera de PostgreSQL; las tablas solo guardan su ruta y metadatos.

## Mapa de dominios

```text
Identidad
User ─┬─ RefreshToken
      ├─ PasswordResetToken
      ├─ Wallet ─ WalletTransaction
      └─ PaymentMethod

Catálogo y grupos
Category ─ PlatformCategory ─ Platform ─ Plan ─ Group
                                              ├─ Credential / CredentialHistory
                                              ├─ GroupProfile
                                              ├─ GroupMembership ─ Payment ─ EarningEntry
                                              ├─ BillingCycle ────┘              │
                                              └─ Review                          └─ CommissionCharge

Mayoreo
User ─ ProviderProfile ─ ProviderListing ─ ProviderOrder ─ ProviderOrderCredential
  └─ WholesaleAccess                         └─ Group resultante

Operación
User ─ Notification
User ─ Incident ─ IncidentMessage
User ─ AdminActionLog
EmailMessage (outbox)
PlatformSettings (configuración única)
```

## Enums

| Enum | Valores |
|---|---|
| `Role` | `USER`, `ADMIN` |
| `AuthProvider` | `LOCAL`, `GOOGLE` |
| `BillingPeriod` | `MONTHLY`, `QUARTERLY`, `SEMIANNUAL`, `ANNUAL` |
| `GroupStatus` | `SEARCHING_MEMBERS`, `READY_TO_START`, `ACTIVE`, `FULL`, `PAUSED`, `CANCELLED` |
| `GroupApprovalStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `CredentialReviewStatus` | `NOT_REQUESTED`, `REQUESTED`, `SUBMITTED`, `APPROVED` |
| `MembershipStatus` | `RESERVED`, `ACTIVE`, `PENDING_PAYMENT`, `SUSPENDED`, `FINISHED`, `CANCELLED` |
| `BillingCycleStatus` | `OPEN`, `CLOSED`, `FAILED` |
| `PaymentStatus` | `PENDING`, `PAID`, `FAILED`, `REFUNDED` |
| `PaymentMethodType` | `CARD`, `WALLET` |
| `WalletTransactionType` | `CREDIT`, `DEBIT` |
| `PayoutStatus` | `PENDING`, `PROCESSING`, `PAID`, `FAILED` |
| `EmailStatus` | `QUEUED`, `SENDING`, `SENT`, `FAILED`, `SKIPPED` |
| `CommissionEntryStatus` | `ACCRUED`, `BILLED`, `SETTLED` |
| `CommissionChargeStatus` | `PENDING`, `IN_REVIEW`, `PAID` |
| `ProviderProfileStatus` | `PENDING`, `APPROVED`, `SUSPENDED`, `REJECTED` |
| `WholesaleAccessStatus` | `REQUESTED`, `AUTHORIZED`, `REJECTED`, `REVOKED` |
| `ProviderOrderStatus` | `AWAITING_PAYMENT`, `PENDING_APPROVAL`, `PENDING_DELIVERY`, `FULFILLED`, `REJECTED`, `CANCELLED` |
| `IncidentContext` | `GROUP_MEMBERSHIP`, `PROVIDER_ORDER` |
| `IncidentStatus` | `OPEN`, `IN_REVIEW`, `RESOLVED`, `ESCALATED` |
| `NotificationType` | eventos de pagos, credenciales, grupos, comisiones, mayoreo, soporte y sistema |

## Identidad y privacidad

### `User` → `users`

Cuenta principal de cualquier comprador, vendedor, proveedor o administrador.

Campos relevantes:

- identidad: `name`, `email` único, `phone`, `avatarUrl`;
- acceso: `passwordHash`, `authProvider`, `googleId` único, `role`, `emailVerified`;
- privacidad: `marketingOptOut`, visibilidad de nombre/avatar y preferencias de notificación;
- reputación: `ratingAvg`;
- retiro: titular, banco, CLABE cifrada/últimos cuatro dígitos y verificación;
- ciclo de vida: `deletedAt`, `createdAt`, `updatedAt`.

La cancelación lógica anonimiza datos y usa `deletedAt`; evita depender de borrados físicos para obligaciones financieras y auditoría.

### `RefreshToken` → `refresh_tokens`

Sesión renovable por dispositivo. Guarda `tokenHash`, vencimiento, revocación, agente de usuario e IP. Nunca guarda el token opaco original.

### `PasswordResetToken` → `password_reset_tokens`

Token de recuperación de un solo uso, también almacenado como hash. `usedAt` impide reutilización y `expiresAt` limita su vida.

## Catálogo

### `Category` → `categories`

Categoría única por nombre. Se relaciona N:N con plataformas.

### `Platform` → `platforms`

Servicio comercial, por ejemplo Netflix o Spotify. Contiene `name`, `logoUrl` y `active`.

### `PlatformCategory` → `platform_categories`

Tabla puente entre `Platform` y `Category`; su clave primaria compuesta evita asociaciones duplicadas.

### `Plan` → `plans`

Variante vendible de una plataforma. Conserva `tierName`, `officialPrice`, `maxSlots`, `billingPeriod`, `commissionPercentage` y `active`. Alimenta grupos y publicaciones de mayoreo.

## Grupos, acceso y perfiles

### `Group` → `groups`

Publicación de un vendedor asociada a un `Plan` y un `owner`.

Agrupa cuatro aspectos diferentes:

- oferta: `availableSlots`, `occupiedSlots`, `pricePerSlot`, `billingDay`;
- ciclo comercial: `status`, `startedAt`, `nextRenewalDate`;
- moderación: `approvalStatus`, revisor, fechas, rechazo y notas internas;
- preparación: estado de revisión de credenciales, avisos de cupo y porcentaje de comisión negociado.

`status` y `approvalStatus` son independientes: un grupo puede estar pausado y pendiente de moderación al mismo tiempo. Solo grupos aprobados y comercialmente disponibles aparecen en el marketplace.

### `Credential` → `credentials`

Una fila por grupo (`groupId` único). Usuario, contraseña y notas se guardan cifrados. Al eliminar el grupo se elimina su credencial.

### `CredentialHistory` → `credential_history`

Audita autor, fecha y motivo de un cambio; deliberadamente no conserva valores antiguos.

### `GroupMembership` → `group_memberships`

Vínculo entre comprador y grupo. Incluye estado, renovación automática, fecha de unión/salida y final del periodo actual.

La migración `add_active_membership_unique_index` agrega un índice único parcial en PostgreSQL para impedir dos membresías simultáneas vivas del mismo usuario en el mismo grupo. Prisma no puede expresar ese `WHERE`, por lo que debe preservarse en las migraciones.

### `GroupProfile` → `group_profiles`

Perfil/pantalla dentro de una cuenta compartida. Pertenece a un grupo y puede asignarse como máximo a una membresía mediante `assignedMembershipId` único.

## Facturación, pagos y ganancias

### `BillingCycle` → `billing_cycles`

Periodo de servicio de un grupo con `periodStart`, `periodEnd` y estado. Agrupa pagos y ganancias del mismo ciclo.

### `Payment` → `payments`

Cobro de una membresía dentro de un ciclo.

Campos principales:

- importe y estado;
- gracia, reintentos y recordatorios;
- ruta/fecha del comprobante;
- cobertura real (`coveredFrom`, `coveredUntil`);
- prorrateo y marcadores de siguiente ciclo;
- referencia opcional a método de pago.

La unicidad `(billingCycleId, membershipId)` impide dos cobros del mismo miembro en un ciclo.

### `PaymentMethod` → `payment_methods`

Abstracción heredada para métodos tokenizados. No guarda números de tarjeta; `gatewayToken` debe provenir de una pasarela. El flujo vigente por transferencia no depende de esta tabla.

### `EarningEntry` → `earning_entries`

Una fila única por pago validado. Congela el bruto, porcentaje de comisión, comisión y neto correspondientes a ese momento. Se vincula posteriormente a un `CommissionCharge`.

### `CommissionCharge` → `commission_charges`

Cuenta por cobrar de Vakeva contra un vendedor. Agrupa ganancias facturables y registra vencimiento, comprobante, revisión, rechazo, pago y recordatorios.

Estados esperados:

```text
PENDING → IN_REVIEW → PAID
             │
             └── rechazo de comprobante → PENDING
```

## Wallet y retiros heredados

### `Wallet` → `wallets`

Una billetera por usuario, con saldo y moneda. Se conserva para compatibilidad e historial del primer diseño financiero.

### `WalletTransaction` → `wallet_transactions`

Movimiento inmutable de crédito/débito. Puede apuntar de forma única a un pago y/o a una solicitud de retiro.

### `PayoutRequest` → `payout_requests`

Solicitud de retiro con estado, importe, método, fecha de solicitud y fecha de pago. El flujo vigente de pagos directos al vendedor reduce su uso operativo, pero no se elimina para conservar compatibilidad.

## Configuración y correo

### `PlatformSettings` → `platform_settings`

Singleton con ID `default`. Almacena la cuenta bancaria de Vakeva donde los vendedores pagan comisiones y los compradores pagan mayoreo. La CLABE de la plataforma se guarda actualmente como configuración administrativa, no como credencial del usuario.

### `EmailMessage` → `email_messages`

Outbox de correo. Guarda destinatario, plantilla, asunto, cuerpos HTML/texto, proveedor, intentos, resultado y programación. `dedupeKey` único evita avisos duplicados.

Flujo típico:

```text
QUEUED → SENDING → SENT
                  └→ FAILED
QUEUED → SKIPPED (preferencias o destinatario no disponible)
```

## Notificaciones, reseñas y auditoría

### `Notification` → `notifications`

Aviso dentro de la aplicación. Pertenece a un usuario y opcionalmente a un grupo; `payload` contiene los datos serializados del evento.

### `Review` → `reviews`

Una reseña por membresía (`membershipId` único). Incluye puntuación, comentario y respuesta pública del vendedor. El promedio agregado actualiza `User.ratingAvg` del propietario.

### `AdminActionLog` → `admin_action_logs`

Registro de acciones administrativas con actor, tipo, entidad, ID objetivo, motivo y fecha. No sustituye un sistema completo de auditoría de cambios de cada columna.

## Proveedores y mayoreo

### `ProviderProfile` → `provider_profiles`

Capacidad de proveedor sobre un `User`; no es un rol adicional. Registra nombre comercial, estado y revisión administrativa.

### `ProviderListing` → `provider_listings`

Oferta de una cuenta completa asociada a un plan. Define precio de mayoreo, inventario, vigencia y si puede renovarse.

### `WholesaleAccess` → `wholesale_access`

Autorización de un usuario para comprar mayoreo. Usa `userId` como PK y puede limitar compras nuevas mediante `monthlyCap`.

### `ProviderOrder` → `provider_orders`

Compra de una publicación de proveedor. Congela precio, vigencia y renovabilidad; registra plazo/comprobante de pago, entrega, vencimiento, reembolso y cancelación.

Una orden puede:

- renovar o reemplazar otra orden mediante relaciones autorreferenciadas;
- producir como máximo un grupo (`resultingGroupId` único);
- tener una credencial entregada e incidencias asociadas.

### `ProviderOrderCredential` → `provider_order_credentials`

Credencial cifrada entregada en una orden (`orderId` único). Se elimina en cascada junto con la orden.

## Soporte

### `Incident` → `incidents`

Caso de soporte con exactamente uno de estos contextos, validado por servicio:

- `GROUP_MEMBERSHIP`: problema entre comprador y vendedor;
- `PROVIDER_ORDER`: problema entre vendedor y proveedor.

Registra reportante, responsable, asunto, estado y resolución.

### `IncidentMessage` → `incident_messages`

Mensaje cronológico de una incidencia, vinculado a autor e incidente.

## Integridad y borrado

Reglas importantes:

- identidad, pagos y auditoría financiera suelen usar `Restrict` o `SetNull` para conservar trazabilidad;
- datos subordinados sin valor independiente usan `Cascade` (tokens, credenciales, mensajes, asociaciones);
- borrar una categoría elimina sus vínculos, no las plataformas;
- una plataforma con planes y un plan con grupos/listings no deben borrarse sin resolver dependencias;
- IDs únicos en credenciales, wallets, perfiles asignados, ganancias y grupos resultantes evitan duplicación funcional;
- varias invariantes de negocio —transiciones de estado, cupos, permisos y contexto de incidencias— se validan en servicios y no solo en el esquema.

## Migraciones

Las migraciones de `prisma/migrations` son un historial acumulativo e inmutable. Cubren:

1. esquema inicial, ARCO, recuperación de contraseña y categorías;
2. membresías únicas, recordatorios y soporte;
3. proveedores, comprobantes y aprobación de grupos/credenciales;
4. perfiles de grupo y preferencias del usuario;
5. órdenes de proveedor y creación de grupos desde mayoreo;
6. ciclo de arranque, prorrateo, ganancias y comisiones;
7. pagos de mayoreo, outbox, avisos de arranque, renovación anticipada y reglas de reseñas.

Crear cambios en desarrollo:

```bash
npx prisma migrate dev --name descripcion_del_cambio
npx prisma generate
```

Aplicar cambios en producción:

```bash
npx prisma migrate deploy
```

No se debe usar `migrate dev`, `db push` ni editar migraciones históricas en producción.

## Respaldo y restauración

Antes de una migración de producción:

```bash
pg_dump --format=custom --file=vakeva.dump "$DATABASE_URL"
pg_restore --list vakeva.dump
```

Los respaldos deben cifrarse, almacenarse fuera del repositorio y probarse periódicamente mediante una restauración aislada. PostgreSQL no contiene los comprobantes físicos: `RECEIPTS_DIR` o el bucket de objetos requiere su propio respaldo coordinado.
