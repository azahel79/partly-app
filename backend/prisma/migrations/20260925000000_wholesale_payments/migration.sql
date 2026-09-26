-- CreateEnum
CREATE TYPE "WholesaleAccessStatus" AS ENUM ('REQUESTED', 'AUTHORIZED', 'REJECTED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_RECEIPT_UPLOADED';
ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_RECEIPT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'WHOLESALE_ACCESS_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'WHOLESALE_ACCESS_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'WHOLESALE_ACCESS_REJECTED';

-- AlterEnum
ALTER TYPE "ProviderOrderStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterTable
ALTER TABLE "provider_listings" ADD COLUMN     "renewable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validity_days" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "provider_orders" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "expiry_notice_stage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_due_at" TIMESTAMP(3),
ADD COLUMN     "receipt_path" TEXT,
ADD COLUMN     "receipt_rejection_reason" TEXT,
ADD COLUMN     "receipt_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "renewable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "renews_order_id" TEXT,
ADD COLUMN     "replaces_order_id" TEXT,
ADD COLUMN     "validity_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "wholesale_access" (
    "user_id" TEXT NOT NULL,
    "status" "WholesaleAccessStatus" NOT NULL,
    "monthly_cap" INTEGER,
    "requested_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesale_access_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "wholesale_access_status_idx" ON "wholesale_access"("status");

-- CreateIndex
CREATE INDEX "provider_orders_status_payment_due_at_idx" ON "provider_orders"("status", "payment_due_at");

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_renews_order_id_fkey" FOREIGN KEY ("renews_order_id") REFERENCES "provider_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_replaces_order_id_fkey" FOREIGN KEY ("replaces_order_id") REFERENCES "provider_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_access" ADD CONSTRAINT "wholesale_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesale_access" ADD CONSTRAINT "wholesale_access_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

