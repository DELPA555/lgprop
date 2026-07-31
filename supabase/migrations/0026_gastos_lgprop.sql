-- ════════════════════════════════════════════════════════════════════════
-- 0026 · Contabilidad interna de LG Prop (Bloque C)
-- Gastos PROPIOS del negocio (sueldos del equipo, herramientas, oficina…),
-- separados de la plata de terceros que se administra. Datos sensibles →
-- solo los admins pueden verlos/editarlos (RLS con is_admin()).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.gastos_lgprop (
  id                 uuid primary key default gen_random_uuid(),
  fecha              date not null default current_date,
  mes_correspondiente date not null,   -- YYYY-MM-01
  concepto           text not null,
  categoria          text,             -- sueldos, herramientas, oficina, impuestos, marketing…
  monto              numeric(14, 2) not null default 0,
  notas              text,
  creado_por         uuid references public.usuarios_equipo(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists gastos_lgprop_mes_idx on public.gastos_lgprop (mes_correspondiente);

alter table public.gastos_lgprop enable row level security;
drop policy if exists gastos_lgprop_admin_all on public.gastos_lgprop;
create policy gastos_lgprop_admin_all on public.gastos_lgprop
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
