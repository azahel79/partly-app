-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_DUE_SOON';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);
