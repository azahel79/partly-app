-- PENDING_PAYMENT representa una solicitud todavía sin pago confirmado. No debe
-- contabilizarse como suscripción activa ni como usuario visible del grupo.
UPDATE "groups" AS g
SET "occupied_slots" = (
  SELECT COUNT(*)::integer
  FROM "group_memberships" AS gm
  WHERE gm."group_id" = g."id"
    AND gm."status" IN ('ACTIVE', 'SUSPENDED')
);

-- Sin miembros confirmados suficientes, un grupo previamente marcado como lleno
-- vuelve a estar disponible en el marketplace.
UPDATE "groups"
SET "status" = 'SEARCHING_MEMBERS'
WHERE "status" = 'FULL'
  AND "occupied_slots" < "available_slots";

-- Mantiene consistente el estado para grupos que sí tienen todos sus cupos confirmados.
UPDATE "groups"
SET "status" = 'FULL'
WHERE "status" = 'SEARCHING_MEMBERS'
  AND "occupied_slots" >= "available_slots";
