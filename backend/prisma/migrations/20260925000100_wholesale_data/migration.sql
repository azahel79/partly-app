-- Datos existentes al pasar el mayoreo a pago por transferencia (va aparte del cambio de esquema
-- porque un valor nuevo de un enum no se puede usar en la misma transacción que lo crea).

-- Las solicitudes que esperaban aprobación no traían comprobante: ahora esperan el pago.
UPDATE "provider_orders"
SET "status" = 'AWAITING_PAYMENT', "payment_due_at" = CURRENT_TIMESTAMP + INTERVAL '48 hours'
WHERE "status" = 'PENDING_APPROVAL';

-- Lo ya cobrado con el saldo antiguo cuenta como pagado.
UPDATE "provider_orders" SET "paid_at" = "created_at" WHERE "status" IN ('PENDING_DELIVERY', 'FULFILLED');

-- Quien ya compraba al mayoreo conserva el acceso, sin tope.
INSERT INTO "wholesale_access" ("user_id", "status", "reviewed_at", "note", "updated_at")
SELECT DISTINCT "buyer_user_id", 'AUTHORIZED'::"WholesaleAccessStatus", CURRENT_TIMESTAMP, 'Acceso previo a la restricción por reputación.', CURRENT_TIMESTAMP
FROM "provider_orders"
WHERE "status" IN ('AWAITING_PAYMENT', 'PENDING_DELIVERY', 'FULFILLED')
ON CONFLICT ("user_id") DO NOTHING;
