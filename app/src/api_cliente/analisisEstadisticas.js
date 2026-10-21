// Equivalente cliente de: GET /api/v1/analisis/estadisticas
// Retorna series para los gráficos de la pestaña ANÁLISIS (Sección 8.1).
import { estado } from './simEstado.js'

export function analisisEstadisticas() {
  return {
    serieROS: estado.historialROS,
    serieHectareas: estado.historialHectareas,
    actual: {
      minutos: estado.minutos,
      hectareas: estado.hectareas,
      ros: estado.ros,
      alturaLlama: estado.alturaLlama,
    },
    amenazadas: estado.amenazadas,
  }
}
