-- Avisos al vendedor antes de iniciar el grupo: "se llenó", nuevo aviso al volver a subir del 75%
-- y recordatorios cuando el grupo lleva días listo sin iniciar.
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_READY_TO_START';
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_FULL';
ALTER TYPE "NotificationType" ADD VALUE 'GROUP_START_REMINDER';

ALTER TABLE "groups" ADD COLUMN "full_notified_at" TIMESTAMP(3);
ALTER TABLE "groups" ADD COLUMN "ready_since" TIMESTAMP(3);
ALTER TABLE "groups" ADD COLUMN "ready_reminder_stage" INTEGER NOT NULL DEFAULT 0;

-- Los grupos que ya estaban listos para iniciar empiezan a contar desde su último aviso (o desde hoy).
UPDATE "groups"
SET "ready_since" = COALESCE("ready_notified_at", NOW())
WHERE "status" = 'READY_TO_START' AND "started_at" IS NULL;
