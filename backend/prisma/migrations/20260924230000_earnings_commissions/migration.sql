-- CreateEnum
CREATE TYPE "CommissionEntryStatus" AS ENUM ('ACCRUED', 'BILLED', 'SETTLED');

-- CreateEnum
CREATE TYPE "CommissionChargeStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'PAID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_RECEIPT_UPLOADED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'COMMISSION_REJECTED';

-- CreateTable
CREATE TABLE "earning_entries" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "billing_cycle_id" TEXT NOT NULL,
    "gross" DECIMAL(10,2) NOT NULL,
    "commission_percentage" DECIMAL(5,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "net" DECIMAL(10,2) NOT NULL,
    "status" "CommissionEntryStatus" NOT NULL DEFAULT 'ACCRUED',
    "charge_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earning_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_charges" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "CommissionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3) NOT NULL,
    "pay_by" TIMESTAMP(3) NOT NULL,
    "receipt_path" TEXT,
    "receipt_uploaded_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "overdue_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bank_holder" TEXT,
    "bank_name" TEXT,
    "bank_clabe" TEXT,
    "bank_reference" TEXT,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "earning_entries_payment_id_key" ON "earning_entries"("payment_id");

-- CreateIndex
CREATE INDEX "earning_entries_seller_id_status_idx" ON "earning_entries"("seller_id", "status");

-- CreateIndex
CREATE INDEX "earning_entries_group_id_idx" ON "earning_entries"("group_id");

-- CreateIndex
CREATE INDEX "earning_entries_billing_cycle_id_idx" ON "earning_entries"("billing_cycle_id");

-- CreateIndex
CREATE INDEX "earning_entries_charge_id_idx" ON "earning_entries"("charge_id");

-- CreateIndex
CREATE INDEX "commission_charges_seller_id_status_idx" ON "commission_charges"("seller_id", "status");

-- CreateIndex
CREATE INDEX "commission_charges_status_pay_by_idx" ON "commission_charges"("status", "pay_by");

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "billing_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earning_entries" ADD CONSTRAINT "earning_entries_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "commission_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ganancias históricas: los pagos ya validados antes de este esquema tuvieron su comisión
-- retenida al abonarse al wallet, así que se registran como ya liquidados (SETTLED).
INSERT INTO "earning_entries" ("id", "payment_id", "seller_id", "group_id", "billing_cycle_id", "gross", "commission_percentage", "commission", "net", "status", "created_at")
SELECT
    gen_random_uuid()::text,
    p."id",
    g."owner_id",
    g."id",
    p."billing_cycle_id",
    p."amount",
    COALESCE(g."commission_percentage", pl."commission_percentage"),
    ROUND(p."amount" * COALESCE(g."commission_percentage", pl."commission_percentage") / 100, 2),
    p."amount" - ROUND(p."amount" * COALESCE(g."commission_percentage", pl."commission_percentage") / 100, 2),
    'SETTLED'::"CommissionEntryStatus",
    COALESCE(p."paid_at", CURRENT_TIMESTAMP)
FROM "payments" p
JOIN "group_memberships" m ON m."id" = p."membership_id"
JOIN "groups" g ON g."id" = m."group_id"
JOIN "plans" pl ON pl."id" = g."plan_id"
WHERE p."status" = 'PAID';
