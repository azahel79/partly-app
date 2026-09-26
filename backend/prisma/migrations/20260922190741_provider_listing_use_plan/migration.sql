/*
  Warnings:

  - You are about to drop the column `platform_id` on the `provider_listings` table. All the data in the column will be lost.
  - You are about to drop the column `tier_name` on the `provider_listings` table. All the data in the column will be lost.
  - Added the required column `plan_id` to the `provider_listings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "provider_listings" DROP CONSTRAINT "provider_listings_platform_id_fkey";

-- DropIndex
DROP INDEX "provider_listings_platform_id_idx";

-- AlterTable
ALTER TABLE "provider_listings" DROP COLUMN "platform_id",
DROP COLUMN "tier_name",
ADD COLUMN     "plan_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "provider_listings_plan_id_idx" ON "provider_listings"("plan_id");

-- AddForeignKey
ALTER TABLE "provider_listings" ADD CONSTRAINT "provider_listings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
