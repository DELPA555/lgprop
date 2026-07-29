# LG Prop — Sistema de administración de alquileres

Aplicación de escritorio para Windows (Electron + React + TypeScript + Vite + Tailwind)
con backend en **Supabase** (Postgres + Auth + Edge Functions). Pensada para uso
multiusuario con base de datos compartida en la nube.

> Estado: **scaffold inicial**. Base de datos, conexión y Dashboard listos.
> Los módulos (Propiedades, Dueños, Inquilinos, Contratos, Índices, Pagos, Equipo)
> se implementan a continuación, uno por uno.

## Stack

- **Electron 33** + **electron-vite** + **electron-builder** (instalador `.exe`)
- **React 18** + **TypeScript** + **Vite** + **Tailwind CSS 3**
- **Supabase**: Postgres, Auth (roles admin/operador), Edge Functions (Deno)
- **Resend** para el envío de emails de avisos

## Estructura

```
lgprop/
├─ electron.vite.config.ts      # Config main / preload / renderer
├─ src/
│  ├─ main/index.ts             # Proceso principal de Electron
│  ├─ preload/index.ts          # Bridge seguro (contextIsolation)
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx, App.tsx
│        ├─ components/          # UI compartida (layout, PageHeader, ...)
│        ├─ pages/               # Una página por módulo
│        ├─ lib/supabase/        # Cliente Supabase
│        └─ types/               # Tipos de la base (database.ts)
└─ supabase/
   ├─ migrations/0001_init.sql   # Esquema completo + RLS
   ├─ cron.sql                   # Scheduling de las Edge Functions
   └─ functions/
      ├─ actualizar-indices/     # Trae ICL/IPC/UVA/Casa Propia (mensual)
      └─ enviar-avisos/          # Notificaciones + email digest (diario)
```

## Puesta en marcha (desarrollo)

### 1. Requisitos
- Node.js 20+
- Una cuenta de [Supabase](https://supabase.com) (proyecto creado)
- (Opcional) [Supabase CLI](https://supabase.com/docs/guides/cli) para migraciones y functions
- Una API key de [Resend](https://resend.com) para los emails

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```
Completá en `.env`:
- `VITE_SUPABASE_URL` — URL del proyecto (Settings → API)
- `VITE_SUPABASE_ANON_KEY` — anon/public key (Settings → API)

Estas dos son públicas por diseño: la seguridad la aplica **RLS** en Postgres.

### 4. Crear el esquema en Supabase
Opción A (SQL Editor): pegá y ejecutá `supabase/migrations/0001_init.sql`.
Opción B (CLI):
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

### 5. Crear el primer usuario admin (bootstrap)
1. En Supabase → **Authentication** → agregá tu usuario (email + password).
2. En el **SQL Editor** ejecutá (con el UUID del auth user):
   ```sql
   insert into public.usuarios_equipo (auth_user_id, nombre, email, rol)
   values ('<uuid-del-auth-user>', 'Tu Nombre', 'mail@dominio.com', 'admin');
   ```
   Desde la app, ese admin ya puede dar de alta al resto del equipo.

### 6. Correr en desarrollo
```bash
npm run dev
```

### 7. Acceso / login
La app está protegida por login (Supabase Auth). Iniciá sesión con el email y la
contraseña del usuario que registraste en Auth y diste de alta en `usuarios_equipo`
(paso 5). Ese admin puede crear al resto del equipo desde **Equipo → Nuevo usuario**
(lo procesa la Edge Function `crear-usuario`). Sin una fila activa en
`usuarios_equipo`, la sesión queda en pantalla de "cuenta sin acceso" (por RLS).

## Edge Functions

```bash
# Deploy
supabase functions deploy actualizar-indices
supabase functions deploy enviar-avisos
supabase functions deploy crear-usuario   # alta de usuarios del equipo (solo admin)

# Secrets (no van en el .exe)
supabase secrets set RESEND_API_KEY=re_xxx \
  EMAIL_FROM="LG Prop <avisos@tudominio.com>" \
  AVISOS_EMAIL_TO="equipo@tudominio.com"
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles en el entorno.
```

Programar la ejecución automática: ejecutá `supabase/cron.sql` (usa `pg_cron` + `pg_net`).

> **Índices:** `actualizar-indices` usa la API de Series de Tiempo de
> `datos.gob.ar` (republica BCRA e INDEC). Antes de producción, **verificá los IDs
> de serie** en `supabase/functions/actualizar-indices/index.ts` contra el catálogo:
> https://apis.datos.gob.ar/series/api/search/?q=ICL

## Generar el instalador `.exe`

```bash
npm run build:win
```
El instalador NSIS queda en `dist-installer/LG-Prop-Setup-<version>.exe`.

## Roles

- **admin**: acceso total, incluida la gestión del equipo (`usuarios_equipo`).
- **operador**: acceso a los datos operativos (propiedades, contratos, pagos, etc.).

La política fina operador/admin se puede endurecer en las policies de RLS
(`0001_init.sql`) a medida que definamos permisos por módulo.

## Notas de diseño

- Las **actualizaciones de monto nunca se auto-aplican**: el motor calcula y avisa,
  pero el aumento se aplica solo cuando un usuario lo confirma.
- Los emails usan lenguaje claro y profesional, sin tono acusatorio.
