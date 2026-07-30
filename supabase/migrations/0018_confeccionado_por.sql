-- ════════════════════════════════════════════════════════════════════════
-- 0018 · Quién confeccionó cada contrato
-- Referencia al miembro del equipo (usuarios_equipo) que redactó/cargó el
-- contrato. Se completa automáticamente al generar con IA y es editable en el
-- formulario. Si el miembro se elimina, queda en NULL (no se pierde el contrato).
-- ════════════════════════════════════════════════════════════════════════

alter table public.contratos
  add column if not exists confeccionado_por uuid
    references public.usuarios_equipo(id) on delete set null;

comment on column public.contratos.confeccionado_por is
  'Miembro del equipo que confeccionó/redactó el contrato (usuarios_equipo.id).';

create index if not exists idx_contratos_confeccionado_por
  on public.contratos(confeccionado_por);
