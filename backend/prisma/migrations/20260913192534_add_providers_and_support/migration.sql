-- CreateEnum
CREATE TYPE "ProviderProfileStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProviderOrderStatus" AS ENUM ('PENDING_DELIVERY', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentContext" AS ENUM ('GROUP_MEMBERSHIP', 'PROVIDER_ORDER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'PROVIDER_ORDER_DELIVERED';
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_OPENED';
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_STATUS_CHANGED';

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "status" "ProviderProfileStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_listings" (
    "id" TEXT NOT NULL,
    "provider_profile_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "tier_name" TEXT NOT NULL,
    "wholesale_price" DECIMAL(10,2) NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_orders" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_user_id" TEXT NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "status" "ProviderOrderStatus" NOT NULL DEFAULT 'PENDING_DELIVERY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "provider_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_order_credentials" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "username_encrypted" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "notes_encrypted" TEXT,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_order_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "context" "IncidentContext" NOT NULL,
    "group_membership_id" TEXT,
    "provider_order_id" TEXT,
    "reported_by_user_id" TEXT NOT NULL,
    "assigned_to_user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_messages" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_user_id_key" ON "provider_profiles"("user_id");

-- CreateIndex
CREATE INDEX "provider_listings_provider_profile_id_idx" ON "provider_listings"("provider_profile_id");

-- CreateIndex
CREATE INDEX "provider_listings_platform_id_idx" ON "provider_listings"("platform_id");

-- CreateIndex
CREATE INDEX "provider_orders_listing_id_idx" ON "provider_orders"("listing_id");

-- CreateIndex
CREATE INDEX "provider_orders_buyer_user_id_idx" ON "provider_orders"("buyer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_order_credentials_order_id_key" ON "provider_order_credentials"("order_id");

-- CreateIndex
CREATE INDEX "incidents_group_membership_id_idx" ON "incidents"("group_membership_id");

-- CreateIndex
CREATE INDEX "incidents_provider_order_id_idx" ON "incidents"("provider_order_id");

-- CreateIndex
CREATE INDEX "incidents_reported_by_user_id_idx" ON "incidents"("reported_by_user_id");

-- CreateIndex
CREATE INDEX "incidents_assigned_to_user_id_idx" ON "incidents"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "incident_messages_incident_id_idx" ON "incident_messages"("incident_id");

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_listings" ADD CONSTRAINT "provider_listings_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_listings" ADD CONSTRAINT "provider_listings_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "provider_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_orders" ADD CONSTRAINT "provider_orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_order_credentials" ADD CONSTRAINT "provider_order_credentials_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "provider_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_provider_order_id_fkey" FOREIGN KEY ("provider_order_id") REFERENCES "provider_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
