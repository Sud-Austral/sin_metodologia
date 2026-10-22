import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

export default function ChatPanel({ mensajes, cargando, visible, onEnviar, ia, onCargarIA }) {
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, cargando])
  if (!visible) return null

  function enviar() {
    const p = input.trim()
    if (!p || cargando) return
    setInput('')
    onEnviar(p)
  }

  const badge = ia.estado === 'listo' ? 'local · WebGPU' : ia.estado === 'cargando' ? `cargando ${ia.progreso}%` : ia.webgpu === false ? 'plantillas (sin WebGPU)' : 'plantillas'

  return (
    <div className="chat-panel">
      <div className="chat-cab">
        <span>✨ IA del Incendio</span>
        <span className={`badge ${ia.estado}`} title={ia.detalle || ''}>{badge}</span>
      </div>
      {ia.estado !== 'listo' && ia.estado !== 'cargando' && (
        <div className="chat-ia-aviso">
          {ia.webgpu ? (
            <button className="btn btn-sm" onClick={onCargarIA}>Cargar IA local ({ia.modelo.split('-').slice(0, 3).join(' ')}, ~700 MB)</button>
          ) : (
            <span>Sin WebGPU en este navegador: respuestas por plantilla con cifras reales de la simulación. {ia.detalle}</span>
          )}
        </div>
      )}
      {ia.estado === 'cargando' && <div className="chat-ia-aviso"><progress value={ia.progreso} max="100" /> {ia.detalle}</div>}
      <div className="chat-hist">
        {mensajes.length === 0 && (
          <div className="chat-vacio">
            <p>💭 Pregunta sobre el incendio</p>
            <p className="dim">"¿ROS actual?", "Desplegar Brigada R-22 al norte", "¿Qué pasa si viento sube a 35 km/h en 30 min?", "Riesgo para Puerto Montt", "Exporta todo a PDF"</p>
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={m.id || i} className={`msg ${m.rol} ${m.error ? 'error' : ''}`}>
            <div className="burbuja"><ReactMarkdown>{m.contenido}</ReactMarkdown></div>
            {(m.tokens || m.latencia_s != null) && <div className="meta">{m.tokens ? `🔢 ${m.tokens} tokens` : ''} {m.latencia_s != null ? `· ${m.latencia_s}s` : ''} {m.fuente ? `· ${m.fuente}` : ''}</div>}
          </div>
        ))}
        {cargando && <div className="msg assistant"><div className="burbuja pulso">⏳ Pensando...</div></div>}
        <div ref={scrollRef} />
      </div>
      <div className="chat-input">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} placeholder="¿ROS? ¿Estrategia?..." disabled={cargando} />
        <button className="btn" onClick={enviar} disabled={cargando || !input.trim()} title="Enviar (Enter)">📨</button>
      </div>
    </div>
  )
}
