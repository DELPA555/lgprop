-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0013: cron de cotizaciones del dólar (diario)
-- ⚠️ Específica del proyecto tvvmsuminnurcqtjvepm (URL + anon key públicas inline).
--    cron.schedule es idempotente por nombre de job.
-- ════════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'lgprop-actualizar-cotizaciones',
  '30 11 * * *',
  $$
  select net.http_post(
    url     := 'https://tvvmsuminnurcqtjvepm.functions.supabase.co/actualizar-cotizaciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dm1zdW1pbm51cmNxdGp2ZXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDU2MzYsImV4cCI6MjEwMDkyMTYzNn0.NyVupkFs4Y7UHWxy8wrUs98WsZx3gXUDcIiAF6Bs6PI'
    ),
    body    := '{}'::jsonb
  );
  $$
);
