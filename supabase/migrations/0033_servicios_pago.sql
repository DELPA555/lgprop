-- ════════════════════════════════════════════════════════════════════════════
-- 0033 · Confirmación de servicios por mes (expensas / luz / agua / gas)
-- ⚠️ SOLO SEGUIMIENTO/CONTROL: los servicios los paga el inquilino directo al
--    proveedor/consorcio. Estos campos NUNCA entran en el cálculo de comisión ni
--    de liquidaciones al dueño (eso lo maneja calc_comision_pago / liquidaciones,
--    que no miran estas columnas).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Servicios pagados por mes en `pagos` (expensas_pagadas ya existe) ─────────
alter table public.pagos
  add column if not exists luz_pagada  boolean not null default false,
  add column if not exists agua_pagada boolean not null default false,
  add column if not exists gas_pagada  boolean not null default false;

-- ── Qué servicios aplican a cada propiedad (para marcar "N/A") ────────────────
-- Default: todos aplican. Si una propiedad no tiene (p. ej.) gas natural, se pone
-- aplica_gas = false y en Pagos el chip de gas sale "N/A" (no se puede marcar).
alter table public.propiedades
  add column if not exists aplica_expensas boolean not null default true,
  add column if not exists aplica_luz      boolean not null default true,
  add column if not exists aplica_agua     boolean not null default true,
  add column if not exists aplica_gas      boolean not null default true;

-- ── Log de actividad al confirmar/desmarcar un servicio ───────────────────────
-- Reutiliza registrar_log (captura usuario + fecha). Un trigger aparte del de
-- comisión (trg_calc_comision_pago), que sólo reacciona a monto/contrato_id.
create or replace function public.log_servicios_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _log constant text := 'servicio';
begin
  if new.expensas_pagadas is distinct from old.expensas_pagadas then
    perform public.registrar_log(_log, 'pagos', new.id, jsonb_build_object('servicio','expensas','pagado',new.expensas_pagadas));
  end if;
  if new.luz_pagada is distinct from old.luz_pagada then
    perform public.registrar_log(_log, 'pagos', new.id, jsonb_build_object('servicio','luz','pagado',new.luz_pagada));
  end if;
  if new.agua_pagada is distinct from old.agua_pagada then
    perform public.registrar_log(_log, 'pagos', new.id, jsonb_build_object('servicio','agua','pagado',new.agua_pagada));
  end if;
  if new.gas_pagada is distinct from old.gas_pagada then
    perform public.registrar_log(_log, 'pagos', new.id, jsonb_build_object('servicio','gas','pagado',new.gas_pagada));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_servicios_pago on public.pagos;
create trigger trg_log_servicios_pago
  after update of expensas_pagadas, luz_pagada, agua_pagada, gas_pagada on public.pagos
  for each row execute function public.log_servicios_pago();
