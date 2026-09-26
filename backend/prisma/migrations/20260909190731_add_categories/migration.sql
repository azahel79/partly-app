/*
  Warnings:

  - You are about to drop the column `category` on the `platforms` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "platforms" DROP COLUMN "category";

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_categories" (
    "platform_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "platform_categories_pkey" PRIMARY KEY ("platform_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "platform_categories_category_id_idx" ON "platform_categories"("category_id");

-- AddForeignKey
ALTER TABLE "platform_categories" ADD CONSTRAINT "platform_categories_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_categories" ADD CONSTRAINT "platform_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
