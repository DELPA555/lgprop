-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0009: motivo de finalización de contrato
-- Texto libre opcional para dejar registrado por qué terminó un contrato
-- (mudanza, falta de pago, no renovación, venta, etc.). Se muestra en el
-- historial de inquilinos de la propiedad.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contratos
  add column if not exists motivo_finalizacion text;
