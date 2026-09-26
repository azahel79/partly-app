-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reminder_stage" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "to_user_id" TEXT,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupe_key" TEXT,
    "send_after" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_dedupe_key_key" ON "email_messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_messages_status_send_after_idx" ON "email_messages"("status", "send_after");

-- CreateIndex
CREATE INDEX "email_messages_to_user_id_created_at_idx" ON "email_messages"("to_user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_created_at_idx" ON "email_messages"("created_at");

