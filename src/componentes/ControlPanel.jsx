import React, { useState } from 'react'
import { GraficoLineas } from './Graficos.jsx'

export const PESTANAS = ['FUEGO', 'ESCENARIO', 'RECURSOS', 'PERIMETRO', 'ANÁLISIS', 'REPORTES']

export default function ControlPanel({ stats, est, historial, pestana, setPestana, acciones, modoClick, setModoClick, estrategias, conversaciones, meteoInfo, demInfo, fps, msTick, ia }) {
  return (
    <div className="control-panel">
      <div className="tabs">
        {PESTANAS.map((p) => <button key={p} className={`tab ${pestana === p ? 'activa' : ''}`} onClick={() => setPestana(p)}>{p}</button>)}
      </div>
      <div className="tab-body">
        {pestana === 'FUEGO' && <TabFuego est={est} stats={stats} acciones={acciones} modoClick={modoClick} setModoClick={setModoClick} />}
        {pestana === 'ESCENARIO' && <TabEscenario est={est} acciones={acciones} meteoInfo={meteoInfo} demInfo={demInfo} fps={fps} msTick={msTick} ia={ia} />}
        {pestana === 'RECURSOS' && <TabRecursos est={est} stats={stats} acciones={acciones} modoClick={modoClick} setModoClick={setModoClick} />}
        {pestana === 'PERIMETRO' && <TabPerimetro est={est} stats={stats} modoClick={modoClick} setModoClick={setModoClick} acciones={acciones} />}
        {pestana === 'ANÁLISIS' && <TabAnalisis stats={stats} historial={historial} />}
        {pestana === 'REPORTES' && <TabReportes acciones={acciones} estrategias={estrategias} conversaciones={conversaciones} est={est} />}
      </div>
    </div>
  )
}

function Fila({ label, children }) { return <label className="fila"><span>{label}</span>{children}</label> }

function TabFuego({ est, stats, acciones, modoClick, setModoClick }) {
  const [, rerender] = useState(0)
  const set = (k, v) => { est[k] = v; rerender((x) => x + 1) }
  return (
    <div>
      <Fila label={`Viento ${est.viento_kmh} km/h`}><input type="range" min="0" max="80" value={est.viento_kmh} disabled={est.usarMeteo} onChange={(e) => set('viento_kmh', +e.target.value)} /></Fila>
      <Fila label={`Dirección ${est.viento_dir}° (desde)`}><input type="range" min="0" max="359" value={est.viento_dir} disabled={est.usarMeteo} onChange={(e) => set('viento_dir', +e.target.value)} /></Fila>
      <Fila label={`Humedad combustible ${est.humedad}%`}><input type="range" min="1" max="40" value={est.humedad} disabled={est.usarMeteo} onChange={(e) => set('humedad', +e.target.value)} /></Fila>
      <Fila label="Viento automático (Open-Meteo, 1 min = 1 h)"><input type="checkbox" checked={est.usarMeteo} disabled={!est.meteo} onChange={(e) => set('usarMeteo', e.target.checked)} /></Fila>
      <Fila label={`Ajuste ROS ×${est.params.ajusteROS}`}><input type="range" min="0.2" max="2" step="0.1" value={est.params.ajusteROS} onChange={(e) => { est.params.ajusteROS = +e.target.value; rerender((x) => x + 1) }} /></Fila>
      <Fila label="Pavesas (focos secundarios)"><input type="checkbox" checked={!!est.params.pavesas} onChange={(e) => { est.params.pavesas = e.target.checked; rerender((x) => x + 1) }} /></Fila>
      <Fila label={`dt por tick: ${est.dt} min`}><input type="range" min="1" max="15" value={est.dt} onChange={(e) => set('dt', +e.target.value)} /></Fila>
      <div className="botones">
        <button className="btn" onClick={() => acciones.control(est.pausado ? 'reanudar' : 'pausar')}>{est.pausado ? '▶️ Reanudar' : '⏸️ Pausar'}</button>
        <button className="btn" onClick={() => acciones.control('reiniciar')}>🔄 Reiniciar</button>
        <button className={`btn ${modoClick === 'ignicion' ? 'on' : ''}`} onClick={() => setModoClick(modoClick === 'ignicion' ? null : 'ignicion')}>🔥 Nuevo foco (clic en mapa)</button>
      </div>
      <div className="stats-grid">
        <div><b>{stats.minutos}</b> min</div><div><b>{stats.hectareas}</b> ha</div><div><b>{stats.ros_cabeza}</b> m/min</div><div><b>{stats.altura_llama}</b> m llama</div>
        <div><b>{stats.celdas_ardiendo}</b> ardiendo</div><div><b>{stats.modelo}</b> cabeza</div>
      </div>
    </div>
  )
}

function TabEscenario({ est, acciones, meteoInfo, demInfo, fps, msTick, ia }) {
  const [lat, setLat] = useState(est.lat); const [lng, setLng] = useState(est.lng)
  const [nombre, setNombre] = useState(est.nombre); const [fecha, setFecha] = useState(est.fecha); const [hora, setHora] = useState(est.hora_inicio)
  const [exag, setExag] = useState(est.exageracion)
  return (
    <div>
      <Fila label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Fila>
      <Fila label="Lugar (lat, lng)"><span className="dos"><input type="number" step="0.0001" value={lat} onChange={(e) => setLat(+e.target.value)} /><input type="number" step="0.0001" value={lng} onChange={(e) => setLng(+e.target.value)} /></span></Fila>
      <Fila label="Fecha / hora"><span className="dos"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></span></Fila>
      <Fila label={`Área de trabajo: ${est.grid.ancho}×${est.grid.alto} celdas de ${est.grid.celda} m (${(est.grid.ancho * est.grid.celda / 1000).toFixed(1)} km)`}><span /></Fila>
      <Fila label={`Exageración vertical ×${exag}`}><input type="range" min="1" max="3" step="0.25" value={exag} onChange={(e) => { setExag(+e.target.value); acciones.exageracion(+e.target.value) }} /></Fila>
      <div className="botones">
        <button className="btn" onClick={() => acciones.cargarEscenario({ nombre, lat, lng, fecha, hora_inicio: hora })}>🌍 Cargar escenario (DEM + OSM + meteo)</button>
        <button className="btn" onClick={() => acciones.cargarEscenario({ nombre: 'Puerto Varas ladera', lat: -41.30, lng: -72.95, fecha, hora_inicio: hora })}>Puerto Varas</button>
        <button className="btn" onClick={() => acciones.cargarEscenario({ nombre: 'Cochamó', lat: -41.49, lng: -72.32, fecha, hora_inicio: hora })}>Cochamó</button>
      </div>
      <div className="info">
        <div>DEM: <b>{demInfo.fuente}</b> {demInfo.ms != null ? `(${Math.round(demInfo.ms)} ms${demInfo.tiles ? `, ${demInfo.tiles} tiles` : ''})` : ''} {demInfo.aviso && <span className="warn">⚠️ {demInfo.aviso}</span>}</div>
        <div>OSM: <b>{est.ciudad?.fuente || 'n/d'}</b> — {est.ciudad?.edificios?.length ?? 0} edificios, {est.ciudad?.calles?.length ?? 0} calles, {est.ciudad?.servicios?.length ?? 0} servicios</div>
        <div>Meteo: <b>{meteoInfo.fuente}</b> {meteoInfo.horas ? `${meteoInfo.horas} h` : ''} {meteoInfo.actual ? `· ahora ${meteoInfo.actual.temp}°C HR ${meteoInfo.actual.hr}% viento ${meteoInfo.actual.vientoKmh} km/h FWI ${meteoInfo.actual.fwiIndice} (${meteoInfo.peligro})` : ''}</div>
        <div>Render: <b>{fps.toFixed(0)} FPS</b> · tick CA {msTick.toFixed(1)} ms (worker) · IA: {ia.estado} {ia.gpu ? `· GPU ${ia.gpu}` : ''}</div>
      </div>
    </div>
  )
}

function TabRecursos({ est, stats, acciones, modoClick, setModoClick }) {
  const [sel, setSel] = useState('R-22')
  return (
    <div>
      <table className="tabla">
        <thead><tr><th>ID</th><th>Tipo</th><th>Estado</th><th>ETA</th><th>Capacidad</th></tr></thead>
        <tbody>{est.recursos.map((r) => <tr key={r.id} className={sel === r.id ? 'sel' : ''} onClick={() => setSel(r.id)}><td>{r.id}</td><td>{r.tipo}</td><td>{r.estado}</td><td>{r.eta_min ?? '-'}</td><td>{r.capacidad}</td></tr>)}</tbody>
      </table>
      <div className="botones">
        <button className={`btn ${modoClick === 'desplegar' ? 'on' : ''}`} onClick={() => setModoClick(modoClick === 'desplegar' ? null : 'desplegar')}>🎯 Desplegar {sel} (clic en mapa)</button>
        {['norte', 'este', 'sur', 'oeste'].map((d) => <button key={d} className="btn btn-sm" onClick={() => acciones.desplegarDireccion(sel, d)}>{sel} → {d}</button>)}
        <button className={`btn ${modoClick === 'retardante' ? 'on' : ''}`} onClick={() => setModoClick(modoClick === 'retardante' ? null : 'retardante')}>🧪 Retardante 1.200 L (clic)</button>
      </div>
      <div className="info">{stats.recursos_markdown.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  )
}

function TabPerimetro({ est, stats, modoClick, setModoClick, acciones }) {
  const accesos = (est.ciudad?.calles || []).filter((c) => c.nombre).slice(0, 12)
  return (
    <div>
      <div className="botones">
        <button className={`btn ${modoClick === 'corte' ? 'on' : ''}`} onClick={() => setModoClick(modoClick === 'corte' ? null : 'corte')}>✂️ Cortafuego 200 m (clic)</button>
        <button className={`btn ${modoClick === 'exclusion' ? 'on' : ''}`} onClick={() => setModoClick(modoClick === 'exclusion' ? null : 'exclusion')}>⛔ Zona exclusión r=150 m (clic)</button>
      </div>
      <div className="info">
        <div>Perímetro: {stats.perimetro_puntos} puntos · Frente activo: {stats.frente_puntos} celdas · Expansiones de grid: {est.grid.expansiones}</div>
        <div>Accesos (OSM):</div>
        <ul>{accesos.map((c) => <li key={c.id}>{c.nombre} <span className="dim">({c.tipo})</span> <button className="btn btn-xs" onClick={() => acciones.desplegarEn('R-22', c.coords[0][0], c.coords[0][1])}>R-22 aquí</button></li>)}{!accesos.length && <li className="dim">sin calles con nombre en el área</li>}</ul>
        <div>Instalaciones críticas (buffer 500 m):</div>
        <ul>{stats.amenazadas.map((a) => <li key={a.id} className={a.amenazada ? 'warn' : ''}>{a.nombre}: {a.distancia_m} m {a.amenazada ? '⚠️ AMENAZADA' : ''}</li>)}</ul>
      </div>
    </div>
  )
}

function TabAnalisis({ stats, historial }) {
  const ros = [{ nombre: 'ROS m/min', color: '#ff7a3d', puntos: historial.map((h) => [h.t, h.ros]) }]
  const ha = [{ nombre: 'Hectáreas', color: '#f4d35e', puntos: historial.map((h) => [h.t, h.ha]) }]
  const alt = [{ nombre: 'Altura llama m', color: '#e63946', puntos: historial.map((h) => [h.t, h.altura]) }]
  return (
    <div>
      <GraficoLineas series={ros} titulo="ROS vs tiempo" unidadY="m/min" />
      <GraficoLineas series={ha} titulo="Hectáreas vs tiempo" unidadY="ha" />
      <GraficoLineas series={alt} titulo="Altura de llama vs tiempo" unidadY="m" alto={120} />
      <table className="tabla"><thead><tr><th>Instalación</th><th>Tipo</th><th>Distancia</th><th>Estado</th></tr></thead>
        <tbody>{stats.amenazadas.map((a) => <tr key={a.id} className={a.amenazada ? 'warn' : ''}><td>{a.nombre}</td><td>{a.tipo}</td><td>{a.distancia_m} m</td><td>{a.amenazada ? '⚠️ AMENAZADA' : 'ok'}</td></tr>)}</tbody></table>
      <div className="info">Flancos: cabeza {stats.ros_cabeza} · flanco {stats.ros_flanco} · cola {stats.ros_cola} m/min</div>
    </div>
  )
}

function TabReportes({ acciones, estrategias, conversaciones, est }) {
  return (
    <div>
      <div className="botones">
        {['markdown', 'pdf', 'kmz', 'csv', 'json'].map((f) => <button key={f} className="btn" onClick={() => acciones.exportar(f)}>⬇️ {f.toUpperCase()}</button>)}
        <button className="btn" onClick={() => acciones.guardarEstrategia()}>💾 Guardar estrategia</button>
        <button className="btn" onClick={() => acciones.nuevaConversacion()}>🆕 Nueva conversación</button>
      </div>
      <div className="info">
        <div>Estrategias guardadas ({estrategias.length}):</div>
        <ul>{estrategias.map((e) => <li key={e.id}>{e.nombre} <span className="dim">{e.fecha?.slice(0, 16)}</span></li>)}</ul>
        <div>Conversaciones en IndexedDB ({conversaciones.length}):</div>
        <ul>{conversaciones.map((c) => <li key={c.id}>{c.id.slice(0, 8)} · {c.num_mensajes} msgs · {c.fecha_creacion?.slice(0, 16)} {c.id === est.conversacion_id ? '(actual)' : <button className="btn btn-xs" onClick={() => acciones.cargarConversacion(c.id)}>cargar</button>}</li>)}</ul>
        <div>Acciones ejecutadas ({est.acciones.length}):</div>
        <ul>{est.acciones.slice(-8).reverse().map((a, i) => <li key={i}>T+{a.t} · {a.tipo} · {a.detalle}</li>)}</ul>
      </div>
    </div>
  )
}
