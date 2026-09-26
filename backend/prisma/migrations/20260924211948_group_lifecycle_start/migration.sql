-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GroupStatus" ADD VALUE 'READY_TO_START';
ALTER TYPE "GroupStatus" ADD VALUE 'ACTIVE';

-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'RESERVED';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "ready_notified_at" TIMESTAMP(3),
ADD COLUMN     "started_at" TIMESTAMP(3);

