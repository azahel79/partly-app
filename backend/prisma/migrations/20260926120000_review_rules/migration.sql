-- Reseñas: respuesta del vendedor y recordatorio al comprador para que la deje.
ALTER TABLE "reviews" ADD COLUMN "seller_reply" TEXT;
ALTER TABLE "reviews" ADD COLUMN "seller_reply_at" TIMESTAMP(3);
ALTER TABLE "group_memberships" ADD COLUMN "review_reminder_sent_at" TIMESTAMP(3);
