-- CreateEnum
CREATE TYPE "CredentialReviewStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'SUBMITTED', 'APPROVED');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "credential_review_status" "CredentialReviewStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "credentials_requested_at" TIMESTAMP(3),
ADD COLUMN     "credentials_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "credentials_submitted_at" TIMESTAMP(3);
