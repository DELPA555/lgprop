-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0011: archivos de contratos (Supabase Storage)
-- Bucket PRIVADO 'contratos-archivos' (solo miembros activos autenticados) +
-- tabla de metadatos para asociar cada archivo a su contrato (múltiples por
-- contrato: original, anexos, etc.).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Bucket privado ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('contratos-archivos', 'contratos-archivos', false)
  on conflict (id) do nothing;

-- ── Políticas de Storage: solo miembros activos, solo este bucket ───────────
drop policy if exists "contratos_archivos_select" on storage.objects;
create policy "contratos_archivos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos-archivos' and public.is_active_member());

drop policy if exists "contratos_archivos_insert" on storage.objects;
create policy "contratos_archivos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contratos-archivos' and public.is_active_member());

drop policy if exists "contratos_archivos_update" on storage.objects;
create policy "contratos_archivos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'contratos-archivos' and public.is_active_member());

drop policy if exists "contratos_archivos_delete" on storage.objects;
create policy "contratos_archivos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contratos-archivos' and public.is_active_member());

-- ── Metadatos ───────────────────────────────────────────────────────────────
create table if not exists public.contratos_archivos (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.contratos(id) on delete cascade,
  nombre       text not null,        -- nombre original del archivo
  path         text not null,        -- ruta dentro del bucket
  tipo         text,                 -- mime type
  tamano       bigint,               -- bytes
  subido_por   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists contratos_archivos_contrato_idx
  on public.contratos_archivos (contrato_id);

alter table public.contratos_archivos enable row level security;
drop policy if exists contratos_archivos_member_all on public.contratos_archivos;
create policy contratos_archivos_member_all on public.contratos_archivos
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
