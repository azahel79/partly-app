-- Duraciones de 2 meses, acceso por link de invitación (YouTube, Spotify y Canva) y entrega de mayoreo por panel.
-- CreateEnum
CREATE TYPE "GroupAccessType" AS ENUM ('CREDENTIALS', 'INVITE_LINK');

-- AlterEnum
ALTER TYPE "BillingPeriod" ADD VALUE 'BIMONTHLY';

-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "invite_link_encrypted" TEXT,
ALTER COLUMN "username_encrypted" DROP NOT NULL,
ALTER COLUMN "password_encrypted" DROP NOT NULL;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "access_type" "GroupAccessType" NOT NULL DEFAULT 'CREDENTIALS';

-- AlterTable
ALTER TABLE "provider_order_credentials" ADD COLUMN     "panel_url_encrypted" TEXT,
ALTER COLUMN "username_encrypted" DROP NOT NULL,
ALTER COLUMN "password_encrypted" DROP NOT NULL;

