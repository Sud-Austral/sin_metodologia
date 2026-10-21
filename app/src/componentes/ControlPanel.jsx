// ControlPanel.jsx: 6 pestañas (Sección 8.1): FUEGO, ESCENARIO, RECURSOS,
// PERIMETRO, ANÁLISIS, REPORTES. Expandido desde las 4 originales del
// "v0.1" según pide la Sección 8.1 del documento fuente.
import { useState } from 'react'
import { estado as simEstado } from '../api_cliente/simEstado.js'
import { despachoDesplegar } from '../api_cliente/despachoDesplegar.js'
import { simulacionAplicarRetardante } from '../api_cliente/simulacionAplicarRetardante.js'
import { simulacionControl } from '../api_cliente/simulacionControl.js'
import { chatExportar } from '../api_cliente/chatExportar.js'
import { analisisEstadisticas } from '../api_cliente/analisisEstadisticas.js'
import MiniGrafico from './MiniGrafico.jsx'

const PESTANAS = ['FUEGO', 'ESCENARIO', 'RECURSOS', 'PERIMETRO', 'ANÁLISIS', 'REPORTES']

export default function ControlPanel({ visible = true, grid = null, worker = null, onCambiarViento, onCambiarHumedad }) {
  const [tab, setTab] = useState('FUEGO')
  const [viento, setViento] = useState(simEstado.velViento)
  const [humedad, setHumedad] = useState(simEstado.humCombustible)
  const [vientoAuto, setVientoAuto] = useState(false)
  const [mensajeAccion, setMensajeAccion] = useState('')
  const [stats, setStats] = useState(analisisEstadisticas())

  if (!visible) return null

  function aplicarViento(v) {
    setViento(v)
    simEstado.velViento = v
    onCambiarViento?.(v)
  }
  function aplicarHumedad(h) {
    setHumedad(h)
    simEstado.humCombustible = h
    onCambiarHumedad?.(h)
  }

  async function desplegarRecurso(recursoId) {
    const r = await despachoDesplegar({ recursoId, destinoLat: simEstado.lat + 0.01, destinoLng: simEstado.lng })
    setMensajeAccion(`${recursoId} en tránsito, ETA ${r.etaMin} min`)
  }

  async function aplicarRetardanteUI() {
    const r = await simulacionAplicarRetardante({ row: 120, col: 120, radioCeldas: 6, grid, worker })
    setMensajeAccion(`Retardante aplicado: ROS -${r.reduccionROSPct}%`)
  }

  async function controlarSimulacion(accion) {
    const r = await simulacionControl({ accion })
    setMensajeAccion(`Simulación: ${r.accion}`)
  }

  async function exportar(formato) {
    const r = await chatExportar({ formato })
    setMensajeAccion(`Exportado: ${r.nombreArchivo}`)
  }

  function refrescarStats() {
    setStats(analisisEstadisticas())
  }

  return (
    <div className="absolute right-3 top-3 w-80 h-[calc(100%-24px)] bg-gray-900/95 border border-gray-700 rounded-lg flex flex-col overflow-hidden shadow-xl text-gray-100 z-10">
      <div className="flex border-b border-gray-700 overflow-x-auto text-[10px]">
        {PESTANAS.map((p) => (
          <button
            key={p}
            onClick={() => { setTab(p); if (p === 'ANÁLISIS') refrescarStats() }}
            className={`px-2 py-2 flex-1 whitespace-nowrap ${tab === p ? 'bg-orange-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {tab === 'FUEGO' && (
          <div className="space-y-3">
            <label className="block text-xs text-gray-400">Viento: {viento} km/h</label>
            <input type="range" min="0" max="80" value={viento} onChange={(e) => aplicarViento(Number(e.target.value))} className="w-full" />
            <label className="block text-xs text-gray-400">Humedad combustible: {humedad}%</label>
            <input type="range" min="0" max="60" value={humedad} onChange={(e) => aplicarHumedad(Number(e.target.value))} className="w-full" />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={vientoAuto} onChange={(e) => setVientoAuto(e.target.checked)} />
              Viento automático (meteorología real)
            </label>
          </div>
        )}

        {tab === 'ESCENARIO' && (
          <div className="space-y-2 text-xs text-gray-300">
            <div>Lugar: {simEstado.nombre}</div>
            <div>Lat/Lng: {simEstado.lat}, {simEstado.lng}</div>
            <div>Tiempo simulado: {simEstado.minutos} min</div>
            <label className="block text-gray-400 mt-2">Exageración vertical del terreno</label>
            <input type="range" min="1" max="4" step="0.1" defaultValue="1.5" className="w-full" />
          </div>
        )}

        {tab === 'RECURSOS' && (
          <div className="space-y-2">
            {simEstado.recursos.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-gray-800 rounded px-2 py-1.5 text-xs">
                <span>{r.id} ({r.tipo}) — {r.estado}</span>
                <button onClick={() => desplegarRecurso(r.id)} className="bg-orange-600 hover:bg-orange-500 px-2 py-0.5 rounded text-[11px]">
                  Desplegar
                </button>
              </div>
            ))}
            <button onClick={aplicarRetardanteUI} className="w-full mt-2 bg-blue-700 hover:bg-blue-600 px-2 py-1.5 rounded text-xs">
              Aplicar retardante (zona centro)
            </button>
          </div>
        )}

        {tab === 'PERIMETRO' && (
          <div className="space-y-2 text-xs text-gray-300">
            <div>Perímetro y frente se derivan en vivo del grid CA (gridAPerimetro / gridAFrente).</div>
            <button onClick={() => controlarSimulacion('pausar')} className="w-full bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded">Pausar</button>
            <button onClick={() => controlarSimulacion('reanudar')} className="w-full bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded">Reanudar</button>
            <button onClick={() => controlarSimulacion('reiniciar')} className="w-full bg-red-800 hover:bg-red-700 px-2 py-1.5 rounded">Reiniciar</button>
          </div>
        )}

        {tab === 'ANÁLISIS' && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400">ROS vs tiempo</div>
            <MiniGrafico datos={stats.serieROS} campoY="ros" color="#f97316" />
            <div className="text-xs text-gray-400">Hectáreas vs tiempo</div>
            <MiniGrafico datos={stats.serieHectareas} campoY="hectareas" color="#22c55e" />
            <div className="text-xs text-gray-400 mt-2">Instalaciones amenazadas</div>
            <table className="w-full text-[11px]">
              <tbody>
                {stats.amenazadas.map((a) => (
                  <tr key={a.nombre}><td>{a.nombre}</td><td className="text-right">{a.distanciaKm} km</td></tr>
                ))}
              </tbody>
            </table>
            <button onClick={refrescarStats} className="w-full bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs">Refrescar</button>
          </div>
        )}

        {tab === 'REPORTES' && (
          <div className="space-y-2">
            {['markdown', 'csv', 'kmz', 'pdf', 'json'].map((f) => (
              <button key={f} onClick={() => exportar(f)} className="w-full bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded text-xs text-left">
                Exportar {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {mensajeAccion && (
        <div className="px-3 py-2 border-t border-gray-700 text-[11px] text-emerald-300">{mensajeAccion}</div>
      )}
    </div>
  )
}
