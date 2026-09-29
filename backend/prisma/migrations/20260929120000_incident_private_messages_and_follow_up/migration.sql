-- Mensajes privados en incidencias (Partly con una de las partes) y seguimiento al responsable:
-- recordatorio a las 24 h, escalada automática a las 72 h y "Partly pidió respuesta".
-- CreateEnum
CREATE TYPE "IncidentMessageAudience" AS ENUM ('ALL', 'REPORTER', 'ASSIGNEE');
-- AlterTable
ALTER TABLE "incident_messages" ADD COLUMN     "audience" "IncidentMessageAudience" NOT NULL DEFAULT 'ALL';
-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "follow_up_stage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_assignee_reply_at" TIMESTAMP(3),
ADD COLUMN     "response_due_at" TIMESTAMP(3),
ADD COLUMN     "response_requested_at" TIMESTAMP(3);

-- Incidencias que ya existían: cuándo contestó por última vez el responsable, para no recordarle de más.
UPDATE "incidents" i SET "last_assignee_reply_at" = m.last_at
FROM (SELECT im."incident_id", MAX(im."created_at") AS last_at FROM "incident_messages" im JOIN "incidents" x ON x."id" = im."incident_id" WHERE im."author_user_id" = x."assigned_to_user_id" GROUP BY im."incident_id") m
WHERE m."incident_id" = i."id";
