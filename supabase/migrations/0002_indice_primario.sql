-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0002: índice primario para el modo "Combinado"
-- El modo Combinado promedia DOS índices reales. Ya existía `indice_secundario`;
-- agregamos `indice_primario` para el otro. Ambos quedan NULL salvo en Combinado.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contratos
  add column if not exists indice_primario tipo_indice;
