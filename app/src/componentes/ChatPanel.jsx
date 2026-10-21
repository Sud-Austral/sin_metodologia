// ChatPanel.jsx (Sección 7.3 del documento fuente) adaptado a "solo
// frontend": en vez de POST /api/v1/chat/consultar, llama a la función
// cliente chatConsultar() directamente. Detecta WebGPU, intenta cargar
// WebLLM, y si no hay GPU disponible usa el respondedor de plantilla local
// (nunca deja la UI en blanco). Historial persistido en IndexedDB.
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { chatConsultar } from '../api_cliente/chatConsultar.js'
import { ClienteIA, detectarWebGPU } from '../ia/webllm_client.js'
import { listarMensajes, listarConversaciones } from '../db/indexeddb.js'
import { estado as simEstado } from '../api_cliente/simEstado.js'

export default function ChatPanel({ visible = true, grid = null, worker = null }) {
  const [mensajes, setMensajes] = useState([])
  const [input, setInput] = useState('')
  const [cargando, setCargando] = useState(false)
  const [estadoIA, setEstadoIA] = useState({ webgpuDisponible: null, listo: false, cargando: true, mensaje: '' })
  const clienteIARef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Recuperar conversación persistida al reabrir (IndexedDB). El id de
  // conversación activo solo vive en memoria (simEstado.conversacionId), así
  // que tras un reload real se perdería la referencia aunque los datos
  // sigan en IndexedDB -- por eso se busca aquí la conversación más
  // reciente de esta simulación y se reconecta `simEstado.conversacionId`
  // a ella antes de pedir sus mensajes. (Bug real encontrado con
  // Playwright: ver ejercicio/EQUIVOCACIONES.md.)
  useEffect(() => {
    async function recuperar() {
      try {
        if (!simEstado.conversacionId) {
          const conversaciones = await listarConversaciones()
          const propias = conversaciones.filter((c) => c.simulacionId === simEstado.simulacionId)
          if (propias.length) {
            propias.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))
            simEstado.conversacionId = propias[0].id
          }
        }
        if (simEstado.conversacionId) {
          const previos = await listarMensajes(simEstado.conversacionId)
          if (previos.length) {
            setMensajes(previos.map((m) => ({ rol: m.rol, contenido: m.contenido, tokens: m.tokensUtilizados })))
          }
        }
      } catch {
        // IndexedDB no disponible: se ignora, el chat sigue funcionando sin historial persistido
      }
    }
    recuperar()
  }, [])

  // Inicializar IA local (WebGPU + WebLLM) o quedarse en modo fallback
  useEffect(() => {
    const webgpuDisponible = detectarWebGPU()
    if (!webgpuDisponible) {
      setEstadoIA({ webgpuDisponible: false, listo: false, cargando: false, mensaje: 'Este navegador no expone WebGPU. El chat funciona en modo plantilla local (sin modelo generativo). Usa Chrome/Edge recientes para IA completa.' })
      return
    }
    const cliente = new ClienteIA()
    clienteIARef.current = cliente
    setEstadoIA((s) => ({ ...s, webgpuDisponible: true, cargando: true, mensaje: 'Descargando modelo WebLLM local…' }))
    cliente.inicializar((reporte) => {
      setEstadoIA((s) => ({ ...s, mensaje: reporte.text || s.mensaje }))
    }).then((r) => {
      if (r.ok) {
        setEstadoIA({ webgpuDisponible: true, listo: true, cargando: false, mensaje: 'Modelo local listo.' })
      } else {
        setEstadoIA({ webgpuDisponible: true, listo: false, cargando: false, mensaje: r.mensaje })
      }
    })
  }, [])

  async function enviarPregunta() {
    if (!input.trim()) return
    const pregunta = input.trim()
    setInput('')
    setMensajes((prev) => [...prev, { rol: 'user', contenido: pregunta }])
    setCargando(true)
    try {
      const resp = await chatConsultar({
        pregunta,
        clienteIA: clienteIARef.current?.listo ? clienteIARef.current : null,
        opcionesComando: { grid, worker },
      })
      setMensajes((prev) => [...prev, { rol: 'assistant', contenido: resp.respuesta, tokens: resp.tokensUtilizados, modelo: resp.modelo }])
    } catch (e) {
      setMensajes((prev) => [...prev, { rol: 'assistant', contenido: `❌ Error: ${e.message}`, error: true }])
    } finally {
      setCargando(false)
    }
  }

  if (!visible) return null

  return (
    <div className="absolute left-3 top-3 w-72 h-[calc(100%-24px)] bg-gray-900/95 border border-gray-700 rounded-lg flex flex-col overflow-hidden shadow-xl backdrop-blur-sm z-10">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
        <span className="font-bold text-gray-100 text-sm">IA del Incendio</span>
        <span className="text-xs text-orange-400 ml-auto font-mono">
          {estadoIA.listo ? 'webllm-local' : 'plantilla-local'}
        </span>
      </div>

      {!estadoIA.listo && (
        <div className="px-3 py-2 text-[11px] text-amber-300 bg-amber-900/20 border-b border-amber-800">
          {estadoIA.cargando ? `⏳ ${estadoIA.mensaje}` : `⚠️ ${estadoIA.mensaje}`}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {mensajes.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-6">
            <p className="mb-2">Pregunta sobre el incendio</p>
            <p className="text-gray-500 text-[11px]">"¿ROS actual?", "Desplegar Brigada R-22 al norte"...</p>
          </div>
        )}
        {mensajes.map((msg, i) => (
          <div key={i} className={msg.rol === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-xs px-3 py-2 rounded-lg text-[13px] text-left ${
                msg.rol === 'user' ? 'bg-orange-600 text-white' : msg.error ? 'bg-red-900/50 text-red-200' : 'bg-gray-800 text-gray-100'
              }`}
            >
              <ReactMarkdown>{msg.contenido}</ReactMarkdown>
            </div>
            {msg.tokens != null && <div className="text-[10px] text-gray-500 mt-1">{msg.tokens} tokens</div>}
          </div>
        ))}
        {cargando && (
          <div className="text-left">
            <div className="inline-block px-3 py-2 rounded-lg bg-gray-800 text-gray-100 text-[13px] animate-pulse">Pensando…</div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-gray-700 bg-gray-800/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviarPregunta()}
            placeholder="¿ROS? ¿Estrategia?..."
            disabled={cargando}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-[12px] text-gray-100 placeholder-gray-400 focus:outline-none focus:border-orange-500 disabled:opacity-50"
          />
          <button
            onClick={enviarPregunta}
            disabled={cargando || !input.trim()}
            className="px-2.5 py-1.5 rounded bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white font-bold text-sm transition-colors"
            title="Enviar (Enter)"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
