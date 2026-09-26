-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false;
