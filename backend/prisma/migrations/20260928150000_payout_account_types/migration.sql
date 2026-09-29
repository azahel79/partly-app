CREATE TYPE "PayoutAccountType" AS ENUM ('CLABE', 'DEBIT_CARD');

ALTER TABLE "users"
  RENAME COLUMN "payout_clabe_encrypted" TO "payout_account_number_encrypted";

ALTER TABLE "users"
  RENAME COLUMN "payout_clabe_last4" TO "payout_account_number_last4";

ALTER TABLE "users"
  ADD COLUMN "payout_account_type" "PayoutAccountType";

UPDATE "users"
SET "payout_account_type" = 'CLABE'
WHERE "payout_account_number_encrypted" IS NOT NULL;
