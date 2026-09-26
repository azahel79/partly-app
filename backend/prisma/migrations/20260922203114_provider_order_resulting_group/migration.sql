-- AlterTable
ALTER TABLE "provider_orders" ADD COLUMN     "resulting_group_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "provider_orders_resulting_group_id_key" ON "provider_orders"("resulting_group_id");

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_resulting_group_id_fkey" FOREIGN KEY ("resulting_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

