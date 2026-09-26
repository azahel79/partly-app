-- Índice único PARCIAL: evita que la misma persona tenga dos membresías "vivas"
-- simultáneas en el mismo grupo (ocupando el mismo cupo dos veces por error).
-- No se puede declarar en schema.prisma (Prisma no soporta índices únicos con WHERE en
-- su DSL), así que se escribe como SQL a mano.
-- Cubre ACTIVE, PENDING_PAYMENT y SUSPENDED (todo estado que todavía reserva un cupo);
-- FINISHED y CANCELLED quedan fuera a propósito, porque ya liberaron el cupo y la
-- persona debe poder volver a unirse al mismo grupo después.
CREATE UNIQUE INDEX "group_memberships_group_id_user_id_live_key"
  ON "group_memberships" ("group_id", "user_id")
  WHERE "status" IN ('ACTIVE', 'PENDING_PAYMENT', 'SUSPENDED');
