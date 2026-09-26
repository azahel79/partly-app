-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "bank_account_number" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receipt_path" TEXT,
ADD COLUMN     "receipt_uploaded_at" TIMESTAMP(3);
