-- Comisión fija del 9% para todos los grupos y solicitudes de comisión reducida.

-- CreateEnum
CREATE TYPE "CommissionRateRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_RATE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_RATE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_RATE_REJECTED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commission_rate" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "commission_rate_requests" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" "CommissionRateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "current_rate" DECIMAL(5,2) NOT NULL,
    "message" TEXT,
    "approved_rate" DECIMAL(5,2),
    "review_note" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rate_requests_status_idx" ON "commission_rate_requests"("status");

-- CreateIndex
CREATE INDEX "commission_rate_requests_seller_id_idx" ON "commission_rate_requests"("seller_id");

-- AddForeignKey
ALTER TABLE "commission_rate_requests" ADD CONSTRAINT "commission_rate_requests_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rate_requests" ADD CONSTRAINT "commission_rate_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Todos los grupos (existentes y en revisión) pasan a la comisión fija del 9%.
-- Los pagos ya registrados conservan el porcentaje con el que se calcularon (earning_entries).
UPDATE "groups" SET "commission_percentage" = 9;
UPDATE "plans" SET "commission_percentage" = 9;
