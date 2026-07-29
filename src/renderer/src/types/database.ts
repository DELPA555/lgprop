// Tipos de la base de datos LG Prop (alineados con supabase/migrations/0001_init.sql).
// IMPORTANTE: las entidades se declaran como `type` (no `interface`) para que
// `Partial<T>` sea asignable a `Record<string, unknown>` y así cumplan el
// GenericSchema de @supabase/supabase-js. Con `interface` el esquema colapsa a `never`.
//
// Cuando el esquema esté estable, se puede regenerar con:
//   supabase gen types typescript --project-id <id> > src/renderer/src/types/database.ts

export type EstadoPropiedad = 'alquilada' | 'vacia'
export type PagaExpensas = 'inquilino' | 'dueno'
export type TipoIndice =
  | 'ICL'
  | 'IPC'
  | 'Casa Propia'
  | 'UVA'
  | 'Combinado'
  | 'Porcentaje fijo'
  | 'Manual'
export type EstadoContrato = 'activo' | 'vencido' | 'rescindido'
export type EstadoPago = 'pagado' | 'pendiente' | 'atrasado'
export type EstadoLiquidacion = 'pendiente' | 'enviada'
export type RolUsuario = 'admin' | 'operador'
export type TipoNotificacion =
  | 'vencimiento_contrato'
  | 'actualizacion_monto'
  | 'pago_atrasado'
  | 'expensas_pendientes'

export type Dueno = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  cbu: string | null
  alias_cbu: string | null
  porcentaje_comision: number
  notas: string | null
  created_at: string
}

export type Inquilino = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  dni: string | null
  garante_nombre: string | null
  garante_telefono: string | null
  garante_dni: string | null
  notas: string | null
  created_at: string
}

export type Propiedad = {
  id: string
  direccion: string
  tipo: string | null
  dueno_id: string | null
  estado: EstadoPropiedad
  monto_expensas: number
  paga_expensas: PagaExpensas
  porcentaje_comision: number | null // NULL = hereda del dueño
  notas: string | null
  created_at: string
}

export type Contrato = {
  id: string
  propiedad_id: string
  inquilino_id: string
  dueno_id: string | null
  fecha_inicio: string
  fecha_fin: string
  monto_inicial: number
  monto_actual: number
  indice_actualizacion: TipoIndice
  indice_primario: TipoIndice | null
  indice_secundario: TipoIndice | null
  frecuencia_actualizacion_meses: number
  duracion_meses: number
  porcentaje_fijo: number | null
  proxima_actualizacion: string | null
  estado: EstadoContrato
  notas: string | null
  created_at: string
}

export type IndiceValor = {
  id: string
  tipo_indice: TipoIndice
  fecha: string
  valor: number
  fuente: string | null
  created_at: string
}

export type ActualizacionContrato = {
  id: string
  contrato_id: string
  fecha_calculo: string
  monto_anterior: number
  monto_nuevo: number
  indice_usado: TipoIndice
  coeficiente: number | null
  confirmado_por_usuario: boolean
  confirmado_at: string | null
  confirmado_por: string | null
  created_at: string
}

export type Pago = {
  id: string
  contrato_id: string
  mes_correspondiente: string
  monto: number
  fecha_pago: string | null
  estado: EstadoPago
  expensas_pagadas: boolean
  porcentaje_comision_aplicado: number
  monto_comision: number
  monto_neto: number
  notas: string | null
  created_at: string
}

export type Liquidacion = {
  id: string
  dueno_id: string
  periodo: string // YYYY-MM-01
  monto_bruto: number
  monto_comision: number
  monto_neto: number
  cant_propiedades: number
  estado: EstadoLiquidacion
  enviada_at: string | null
  generada_por: string | null
  created_at: string
}

export type ContratoGenerado = {
  id: string
  contrato_id: string | null
  origen: string
  generado_por: string | null
  generado_por_nombre: string | null
  datos: Record<string, unknown> | null
  texto: string | null
  created_at: string
}

export type UsuarioEquipo = {
  id: string
  auth_user_id: string
  nombre: string
  email: string
  rol: RolUsuario
  activo: boolean
  created_at: string
}

export type Notificacion = {
  id: string
  tipo: TipoNotificacion
  contrato_id: string | null
  titulo: string
  mensaje: string
  leida: boolean
  email_enviado: boolean
  metadata: Record<string, unknown> | null
  created_at: string
}

// Cada tabla expone Row/Insert/Update/Relationships para satisfacer el
// GenericSchema que espera @supabase/supabase-js v2.
type TableDef<T> = {
  Row: T
  Insert: Partial<T>
  Update: Partial<T>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      duenos: TableDef<Dueno>
      inquilinos: TableDef<Inquilino>
      propiedades: TableDef<Propiedad>
      contratos: TableDef<Contrato>
      indices_valores: TableDef<IndiceValor>
      actualizaciones_contrato: TableDef<ActualizacionContrato>
      pagos: TableDef<Pago>
      usuarios_equipo: TableDef<UsuarioEquipo>
      notificaciones: TableDef<Notificacion>
      contratos_generados: TableDef<ContratoGenerado>
      liquidaciones: TableDef<Liquidacion>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      estado_propiedad: EstadoPropiedad
      paga_expensas: PagaExpensas
      tipo_indice: TipoIndice
      estado_contrato: EstadoContrato
      estado_pago: EstadoPago
      estado_liquidacion: EstadoLiquidacion
      rol_usuario: RolUsuario
      tipo_notificacion: TipoNotificacion
    }
    CompositeTypes: Record<string, never>
  }
}
