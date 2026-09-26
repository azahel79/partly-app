-- Renovación por adelantado: el cobro del ciclo siguiente se genera 3 días antes del corte y el comprador
-- paga antes de usar el mes nuevo. También cubre el lugar que se libera y toma quien lo había apartado.
ALTER TABLE "payments" ADD COLUMN "for_next_cycle" BOOLEAN NOT NULL DEFAULT false;
