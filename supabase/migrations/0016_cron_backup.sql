-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0016: cron de backup semanal (domingos 05:00 UTC ~ 02:00 ARG)
-- ⚠️ Específica del proyecto tvvmsuminnurcqtjvepm (URL + anon key públicas inline).
-- ════════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'lgprop-backup-db',
  '0 5 * * 0',
  $$
  select net.http_post(
    url     := 'https://tvvmsuminnurcqtjvepm.functions.supabase.co/backup-db',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dm1zdW1pbm51cmNxdGp2ZXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDU2MzYsImV4cCI6MjEwMDkyMTYzNn0.NyVupkFs4Y7UHWxy8wrUs98WsZx3gXUDcIiAF6Bs6PI'
    ),
    body    := '{}'::jsonb
  );
  $$
);
