-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0010: configuración general (clave/valor)
-- Tabla simple para settings del sistema. Primer uso: los días de anticipación
-- con que se avisa el vencimiento de contratos (y seguros).
-- Lectura: cualquier miembro activo. Escritura: solo admin.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.configuracion (
  clave       text primary key,
  valor       text not null,
  updated_at  timestamptz not null default now()
);

-- Valor por defecto (equivale al comportamiento anterior: 60 días).
insert into public.configuracion (clave, valor)
  values ('avisos_dias_anticipacion_contrato', '60')
  on conflict (clave) do nothing;

alter table public.configuracion enable row level security;

drop policy if exists configuracion_read on public.configuracion;
create policy configuracion_read on public.configuracion
  for select to authenticated
  using (public.is_active_member());

drop policy if exists configuracion_admin_write on public.configuracion;
create policy configuracion_admin_write on public.configuracion
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
