import React, { useEffect, useRef } from 'react'

// Gráfico de líneas en canvas (sin dependencias): series = [{nombre, color, puntos:[[x,y]]}]
export function GraficoLineas({ series, titulo, unidadY = '', alto = 150 }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const dpr = window.devicePixelRatio || 1
    const W = c.clientWidth, H = alto
    c.width = W * dpr; c.height = H * dpr
    const g = c.getContext('2d'); g.scale(dpr, dpr)
    g.clearRect(0, 0, W, H)
    const M = { l: 42, r: 10, t: 22, b: 22 }
    const pts = series.flatMap((s) => s.puntos)
    if (!pts.length) { g.fillStyle = '#889'; g.font = '11px sans-serif'; g.fillText('Sin datos aún', M.l, H / 2); return }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1), y0 = 0, y1 = Math.max(...ys, 0.1) * 1.1
    const X = (x) => M.l + (x - x0) / (x1 - x0) * (W - M.l - M.r)
    const Y = (y) => H - M.b - (y - y0) / (y1 - y0) * (H - M.t - M.b)
    g.strokeStyle = '#334'; g.lineWidth = 1; g.font = '10px sans-serif'; g.fillStyle = '#aab'
    for (let k = 0; k <= 4; k++) { const y = y0 + (y1 - y0) * k / 4; g.beginPath(); g.moveTo(M.l, Y(y)); g.lineTo(W - M.r, Y(y)); g.stroke(); g.fillText(y.toFixed(y1 > 20 ? 0 : 1), 4, Y(y) + 3) }
    for (let k = 0; k <= 4; k++) { const x = x0 + (x1 - x0) * k / 4; g.fillText(`${Math.round(x)}'`, X(x) - 8, H - 6) }
    g.fillStyle = '#dde'; g.font = 'bold 11px sans-serif'; g.fillText(`${titulo}${unidadY ? ` (${unidadY})` : ''}`, M.l, 13)
    series.forEach((s, si) => {
      g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath()
      s.puntos.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))))
      g.stroke()
      g.fillStyle = s.color; g.font = '10px sans-serif'; g.fillText(s.nombre, W - M.r - 90 - si * 70, 13)
    })
  }, [series, titulo, unidadY, alto])
  return <canvas ref={ref} style={{ width: '100%', height: alto }} />
}
