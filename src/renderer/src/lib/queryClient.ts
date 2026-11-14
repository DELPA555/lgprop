import { QueryClient } from '@tanstack/react-query'

/**
 * Cliente de caché de datos (TanStack Query) para toda la app.
 *
 * Objetivo de rendimiento: al volver a una pantalla ya visitada, mostrar al
 * instante lo último que se vio y revalidar por detrás. Como la base está en
 * us-east-2 (cada consulta ~190 ms de ida y vuelta desde Argentina), evitar
 * re-consultar en cada navegación es la mejora más grande que se siente.
 *
 * - staleTime 30 s: dentro de ese lapso, volver a una pantalla NO dispara una
 *   nueva consulta (instantáneo). Pasados los 30 s, se muestra la caché al toque
 *   y se refresca en segundo plano.
 * - gcTime 5 min: cuánto se conserva en memoria una pantalla que dejaste de ver.
 * - refetchOnWindowFocus: al volver a la ventana de la app, revalida por detrás.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1
    }
  }
})
