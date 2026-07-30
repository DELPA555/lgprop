-- ════════════════════════════════════════════════════════════════════════
-- 0017 · "Administrada por LG Prop"
-- Diferencia las propiedades que administramos activamente (cobramos comisión,
-- generamos liquidaciones, avisamos) de las cargadas solo como referencia.
-- ════════════════════════════════════════════════════════════════════════

alter table public.propiedades
  add column if not exists administrada boolean not null default true;

comment on column public.propiedades.administrada is
  'true = LG Prop la administra (comisión + liquidaciones + avisos). false = solo referencia.';

-- La comisión de una propiedad NO administrada es 0 (no se retiene ni liquida).
create or replace function public.pct_comision_contrato(p_contrato_id uuid)
returns numeric
language sql
stable
as $$
  select case
           when coalesce(p.administrada, true)
             then coalesce(p.porcentaje_comision, d.porcentaje_comision, 0)
           else 0
         end
  from public.contratos c
  join public.propiedades p on p.id = c.propiedad_id
  left join public.duenos d on d.id = coalesce(p.dueno_id, c.dueno_id)
  where c.id = p_contrato_id;
$$;
