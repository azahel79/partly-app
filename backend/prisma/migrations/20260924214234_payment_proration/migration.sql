-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "covered_from" TIMESTAMP(3),
ADD COLUMN     "covered_until" TIMESTAMP(3),
ADD COLUMN     "includes_next_cycle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prorated_days" INTEGER;

