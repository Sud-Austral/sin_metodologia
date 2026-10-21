// Equivalente cliente de: POST /api/v1/chat/consultar
// Contrato original: {pregunta, simulacion_id, grid_ca, estadisticas} ->
//   {respuesta, timestamp, modelo, tokens_utilizados}
// Aquí se agrega `comandoEjecutado` para dejar explícito qué acción cliente
// se disparó (si alguna), ya que no hay backend que lo haga por separado.
import { parseIntencion } from '../ia/intenciones.js'
import { generarRespuestaFallback } from '../ia/respuestaFallback.js'
import { crearConversacion, guardarMensaje } from '../db/indexeddb.js'
import { estado } from './simEstado.js'
import { despachoDesplegar } from './despachoDesplegar.js'
import { despachoEta } from './despachoEta.js'
import { simulacionAplicarRetardante } from './simulacionAplicarRetardante.js'
import { simulacionControl } from './simulacionControl.js'
import { chatExportar } from './chatExportar.js'
import { chatGuardarEstrategia } from './chatGuardarEstrategia.js'

async function ejecutarComando(comando, opciones = {}) {
  try {
    switch (comando.accion) {
      case 'desplegar_recurso': {
        const recursoId = comando.parametros.recursoId || opciones.recursoIdPorDefecto || 'R-22'
        const eta = despachoEta({ recursoId, destinoLat: opciones.destinoLat, destinoLng: opciones.destinoLng })
        const resultado = await despachoDesplegar({
          recursoId,
          destinoLat: opciones.destinoLat,
          destinoLng: opciones.destinoLng,
          destinoNombre: comando.parametros.lugar,
        })
        return { ...comando, resultado: { ...resultado, etaPrevioCalculo: eta } }
      }
      case 'aplicar_retardante': {
        const resultado = await simulacionAplicarRetardante({
          volumenLitros: comando.parametros.volumenLitros,
          row: opciones.row ?? Math.floor((opciones.grid?.height || 240) / 2),
          col: opciones.col ?? Math.floor((opciones.grid?.width || 240) / 2),
          grid: opciones.grid,
          worker: opciones.worker,
        })
        return { ...comando, resultado }
      }
      case 'pausar':
      case 'reanudar':
      case 'reiniciar': {
        const resultado = await simulacionControl({ accion: comando.accion })
        return { ...comando, resultado }
      }
      case 'exportar': {
        const resultado = await chatExportar({ formato: comando.parametros.formato })
        return { ...comando, resultado }
      }
      case 'guardar_estrategia': {
        const resultado = await chatGuardarEstrategia({})
        return { ...comando, resultado }
      }
      case 'evacuar': {
        return { ...comando, resultado: { ok: true, lugar: comando.parametros.lugar, alerta: 'generada' } }
      }
      default:
        return { ...comando, resultado: null }
    }
  } catch (e) {
    return { ...comando, resultado: null, error: e.message }
  }
}

export async function chatConsultar({ pregunta, clienteIA = null, opcionesComando = {} } = {}) {
  if (!pregunta || !pregunta.trim()) throw new Error('chatConsultar: pregunta vacía')

  const comandoDetectado = parseIntencion(pregunta)
  const comandoEjecutado = comandoDetectado ? await ejecutarComando(comandoDetectado, opcionesComando) : null

  let respuesta
  let modelo
  let tokensUtilizados = null
  let latenciaS = null

  if (clienteIA && clienteIA.listo) {
    const r = await clienteIA.responder(pregunta, estado)
    respuesta = r.respuesta
    modelo = r.modelo
    tokensUtilizados = r.tokensUtilizados
    latenciaS = r.latenciaS
  } else {
    respuesta = generarRespuestaFallback(pregunta, estado, comandoEjecutado)
    modelo = 'fallback-template-local'
  }

  try {
    if (!estado.conversacionId) {
      const conv = await crearConversacion(estado.simulacionId)
      estado.conversacionId = conv.id
    }
    await guardarMensaje(estado.conversacionId, 'user', pregunta)
    await guardarMensaje(estado.conversacionId, 'assistant', respuesta, { modelo, tokensUtilizados })
  } catch {
    // IndexedDB no disponible en este entorno (p.ej. Node) -> no se rompe el flujo
  }

  return {
    respuesta,
    timestamp: new Date().toISOString(),
    modelo,
    tokensUtilizados,
    latenciaS,
    comandoEjecutado,
  }
}
