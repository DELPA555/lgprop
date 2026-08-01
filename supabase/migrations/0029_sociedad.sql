-- ════════════════════════════════════════════════════════════════════════
-- 0029 · Sociedad / Socios
-- LG Prop es una sociedad entre dos (o más) socios con % de participación.
-- Dos fuentes de ingreso se reparten por %: la comisión de administración
-- mensual (ya en pagos/liquidaciones) y el HONORARIO POR OPERACIÓN (1 mes de
-- alquiler al concretar un contrato nuevo). Cada socio carga sus propios gastos
-- del negocio. El sistema calcula quién le debe a quién para emparejar.
-- Información privada entre dueños: RLS sólo para socios (is_socio()).
-- ════════════════════════════════════════════════════════════════════════

-- ── Socios ──────────────────────────────────────────────────────────────
create table if not exists public.socios (
  id                       uuid primary key default gen_random_uuid(),
  nombre                   text not null,
  email                    text,
  porcentaje_participacion numeric not null default 50,
  usuario_equipo_id        uuid references public.usuarios_equipo(id) on delete set null,
  activo                   boolean not null default true,
  created_at               timestamptz not null default now()
);

-- ── Gastos del negocio LG Prop (distinto de gastos de propiedad/consorcio) ──
do $$ begin
  create type public.categoria_gasto_sociedad as enum
    ('alquiler_oficina', 'sueldos', 'herramientas', 'marketing', 'otro');
exception when duplicate_object then null; end $$;

create table if not exists public.gastos_sociedad (
  id         uuid primary key default gen_random_uuid(),
  socio_id   uuid not null references public.socios(id) on delete cascade,
  concepto   text not null,
  monto      numeric not null,
  fecha      date not null default current_date,
  categoria  public.categoria_gasto_sociedad not null default 'otro',
  notas      text,
  created_at timestamptz not null default now()
);
create index if not exists gastos_sociedad_fecha_idx on public.gastos_sociedad (fecha);
create index if not exists gastos_sociedad_socio_idx on public.gastos_sociedad (socio_id);

-- ── Honorarios por operación (1 mes de alquiler al concretar un contrato) ──
do $$ begin
  create type public.estado_honorario as enum ('pendiente', 'cobrado');
exception when duplicate_object then null; end $$;

create table if not exists public.honorarios_operacion (
  id          uuid primary key default gen_random_uuid(),
  contrato_id uuid not null unique references public.contratos(id) on delete cascade,
  monto       numeric not null,
  moneda      public.moneda not null default 'ARS',
  fecha_cobro date,
  estado      public.estado_honorario not null default 'pendiente',
  notas       text,
  created_at  timestamptz not null default now()
);
create index if not exists honorarios_estado_idx on public.honorarios_operacion (estado);
create index if not exists honorarios_fecha_cobro_idx on public.honorarios_operacion (fecha_cobro);

-- Trigger: al crear un contrato (manual o vía IA) se genera el honorario
-- pendiente con monto sugerido = alquiler inicial (1 mes), en la moneda del
-- contrato. SECURITY DEFINER para no chocar con RLS del que inserta el contrato.
create or replace function public.gen_honorario_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.honorarios_operacion (contrato_id, monto, moneda, estado)
  values (new.id, coalesce(new.monto_inicial, 0), coalesce(new.moneda, 'ARS'), 'pendiente')
  on conflict (contrato_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_gen_honorario on public.contratos;
create trigger trg_gen_honorario
  after insert on public.contratos
  for each row execute function public.gen_honorario_contrato();

-- ── Liquidaciones entre socios (períodos ya saldados / cerrados) ──────────
do $$ begin
  create type public.estado_liquidacion_socios as enum ('pendiente', 'pagado');
exception when duplicate_object then null; end $$;

create table if not exists public.liquidaciones_socios (
  id                  uuid primary key default gen_random_uuid(),
  periodo             date not null unique,     -- YYYY-MM-01
  comision_total      numeric not null default 0,
  honorarios_total    numeric not null default 0,
  ingresos_total      numeric not null default 0,
  gastos_total        numeric not null default 0,
  detalle_json        jsonb,                    -- snapshot por socio
  deudor_socio_id     uuid references public.socios(id) on delete set null,
  acreedor_socio_id   uuid references public.socios(id) on delete set null,
  monto_deuda         numeric not null default 0,
  estado_pago         public.estado_liquidacion_socios not null default 'pendiente',
  pago_confirmado_por uuid references public.usuarios_equipo(id) on delete set null,
  pago_confirmado_at  timestamptz,
  periodo_cerrado     boolean not null default false,
  cerrado_por         uuid references public.usuarios_equipo(id) on delete set null,
  cerrado_at          timestamptz,
  notas               text,
  created_at          timestamptz not null default now()
);

-- ── Helper de autorización: ¿el usuario actual es socio? ──────────────────
create or replace function public.is_socio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.socios s
    join public.usuarios_equipo u on u.id = s.usuario_equipo_id
    where u.auth_user_id = auth.uid() and u.activo = true and s.activo = true
  );
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.socios               enable row level security;
alter table public.gastos_sociedad      enable row level security;
alter table public.honorarios_operacion enable row level security;
alter table public.liquidaciones_socios enable row level security;

-- socios: leen los socios (y admin para el bootstrap/config); escribe sólo admin
drop policy if exists socios_read on public.socios;
create policy socios_read on public.socios
  for select to authenticated
  using (public.is_socio() or public.is_admin());
drop policy if exists socios_admin_write on public.socios;
create policy socios_admin_write on public.socios
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- gastos del negocio y liquidaciones entre socios: sólo socios (info privada)
drop policy if exists gastos_sociedad_socio_all on public.gastos_sociedad;
create policy gastos_sociedad_socio_all on public.gastos_sociedad
  for all to authenticated
  using (public.is_socio()) with check (public.is_socio());

drop policy if exists liquidaciones_socios_socio_all on public.liquidaciones_socios;
create policy liquidaciones_socios_socio_all on public.liquidaciones_socios
  for all to authenticated
  using (public.is_socio()) with check (public.is_socio());

-- honorarios: operativo (cualquier miembro activo puede verlos/marcarlos cobrados)
drop policy if exists honorarios_member_all on public.honorarios_operacion;
create policy honorarios_member_all on public.honorarios_operacion
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
