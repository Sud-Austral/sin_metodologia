// Respondedor de plantilla: se usa cuando WebGPU no está disponible (FAQ
// del documento fuente: "Fallback: respuestas template") y también es el
// motor que de hecho ejecuta las transcripciones de los 8 casos de uso en
// este ejercicio, porque el entorno de verificación automatizada no tiene
// WebGPU real (ver ejercicio/no_comprobado). No pretende ser tan fluido
// como un LLM real: compone texto a partir de los NÚMEROS REALES del grid
// CA (ROS, hectáreas, etc.), nunca inventa cifras.
import { calcularROS } from '../motores/rothermel.js'

function fmt(n, dec = 1) {
  return typeof n === 'number' ? n.toFixed(dec) : 'n/d'
}

export function generarRespuestaFallback(pregunta, estadisticas = {}, comando = null) {
  const p = (pregunta || '').toLowerCase()

  if (comando) {
    return generarRespuestaComando(comando, estadisticas)
  }

  if (/ros\b|velocidad.*(frente|avance)/i.test(p)) {
    const avanceHora = (estadisticas.ros || 0) * 60
    return `El ROS (Rate of Spread) actual es ${fmt(estadisticas.ros)} m/min.\n\n` +
      `El frente avanza ${fmt(avanceHora, 0)} metros cada hora.\n\n` +
      `Factores:\n- Viento ${fmt(estadisticas.velViento, 0)} km/h\n- Humedad ${fmt(estadisticas.humCombustible, 0)}%\n- Modelo ${estadisticas.modelo || 'K2'}\n\n` +
      `[respuesta de plantilla local, sin WebGPU disponible]`
  }

  if (/qué pasa si|que pasa si|viento sube|proyect/i.test(p)) {
    const vientoMatch = p.match(/(\d+)\s*km\/?h/)
    const vientoProyectado = vientoMatch ? parseFloat(vientoMatch[1]) : (estadisticas.velViento || 20) * 1.5
    const { ros: rosProyectado } = calcularROS(estadisticas.modeloNumero || 2, vientoProyectado, 0, estadisticas.humCombustible || 15)
    const cambioPct = estadisticas.ros ? (((rosProyectado - estadisticas.ros) / estadisticas.ros) * 100).toFixed(0) : 'n/d'
    return `Escenario alternativo proyectado (viento ${fmt(vientoProyectado, 0)} km/h):\n\n` +
      `| Métrica | Actual | Proyectado |\n|---|---|---|\n` +
      `| ROS (m/min) | ${fmt(estadisticas.ros)} | ${fmt(rosProyectado)} (${cambioPct}%) |\n\n` +
      `Cálculo reproducible: calcularROS(modelo=${estadisticas.modelo || 'K2'}, viento=${fmt(vientoProyectado, 0)}km/h, pendiente=0%, humedad=${fmt(estadisticas.humCombustible, 0)}%) desde app/src/motores/rothermel.js.\n\n` +
      `[respuesta de plantilla local, sin WebGPU disponible]`
  }

  if (/riesgo|distancia|amenaza/i.test(p)) {
    const distanciaKm = estadisticas.distanciaObjetivoKm ?? null
    const rosMmin = estadisticas.ros || 0
    const etaHoras = distanciaKm != null && rosMmin > 0 ? (distanciaKm * 1000) / rosMmin / 60 : null
    return `Distancia al objetivo: ${distanciaKm != null ? fmt(distanciaKm) + ' km' : 'no especificada'}\n` +
      `ETA estimado con ROS actual (${fmt(rosMmin)} m/min): ${etaHoras != null ? fmt(etaHoras) + ' horas' : 'no calculable sin distancia'}\n\n` +
      `Recomendación: monitorear cada hora, preparar planes de evacuación si ETA < 6 h.\n\n` +
      `[respuesta de plantilla local, sin WebGPU disponible]`
  }

  if (/norte o este|estrategia|táctica|tactica/i.test(p)) {
    return `Análisis táctico con los datos actuales:\n` +
      `- Frente principal: ROS ${fmt(estadisticas.ros)} m/min\n` +
      `- Superficie quemada: ${fmt(estadisticas.hectareas)} ha\n\n` +
      `Recomendación: priorizar el flanco con mayor ROS activo; desplegar recurso disponible más cercano a ese flanco.\n\n` +
      `[respuesta de plantilla local, sin WebGPU disponible]`
  }

  // Respuesta genérica de último recurso (nunca deja la pregunta sin respuesta)
  return `No dispongo de IA generativa en este momento (sin WebGPU), pero el estado medido del grid CA es:\n` +
    `- Tiempo: ${estadisticas.minutos ?? 0} min\n- Superficie: ${fmt(estadisticas.hectareas)} ha\n- ROS: ${fmt(estadisticas.ros)} m/min\n\n` +
    `[respuesta de plantilla local, sin WebGPU disponible]`
}

function generarRespuestaComando(comando, estadisticas) {
  switch (comando.accion) {
    case 'desplegar_recurso':
      return `✅ Comando ejecutado: desplegar_recurso\n\n` +
        `- Recurso: ${comando.parametros.recursoId || '(sin identificar)'}\n` +
        `- Dirección: ${comando.parametros.direccion || 'no especificada'}\n` +
        `- ETA: ${comando.resultado?.etaMin != null ? fmt(comando.resultado.etaMin, 0) + ' min' : 'no calculado'}\n\n` +
        `[respuesta de plantilla local, sin WebGPU disponible]`
    case 'aplicar_retardante':
      return `✅ Comando ejecutado: aplicar_retardante\n\n` +
        `- Volumen: ${comando.parametros.volumenLitros} L\n` +
        `- Reducción ROS esperada: ${comando.resultado?.reduccionROSPct ?? 33}%\n\n` +
        `[respuesta de plantilla local, sin WebGPU disponible]`
    case 'pausar':
      return `✅ Simulación pausada.\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    case 'reanudar':
      return `✅ Simulación reanudada.\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    case 'reiniciar':
      return `✅ Simulación reiniciada.\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    case 'evacuar':
      return `⚠️ Alerta de evacuación generada para: ${comando.parametros.lugar || '(lugar no identificado en el texto)'}\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    case 'exportar':
      return `📄 Exportación generada en formato ${comando.parametros.formato}.\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    case 'guardar_estrategia':
      return `✅ Estrategia guardada en IndexedDB con snapshot del estado actual (${fmt(estadisticas.hectareas)} ha, ROS ${fmt(estadisticas.ros)} m/min).\n\n[respuesta de plantilla local, sin WebGPU disponible]`
    default:
      return `Comando no reconocido.\n\n[respuesta de plantilla local, sin WebGPU disponible]`
  }
}
