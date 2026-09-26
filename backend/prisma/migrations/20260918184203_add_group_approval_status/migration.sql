-- CreateEnum
CREATE TYPE "GroupApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "approval_status" "GroupApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "groups_approval_status_idx" ON "groups"("approval_status");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
