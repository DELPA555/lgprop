-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0015: bucket de backups (privado, solo admin puede leer/descargar)
-- El export lo genera y sube la Edge Function backup-db (service role, saltea RLS).
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
  values ('backups', 'backups', false)
  on conflict (id) do nothing;

-- Solo el admin puede listar/descargar backups. La escritura/borrado la hace la
-- Edge Function con service role (no necesita policy).
drop policy if exists backups_admin_select on storage.objects;
create policy backups_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and public.is_admin());
