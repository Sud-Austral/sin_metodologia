// Gráfico de línea minimalista en SVG puro (sin librería externa de charts,
// para mantener el bundle pequeño). Usado en la pestaña ANÁLISIS.
export default function MiniGrafico({ datos, campoX = 'minutos', campoY, color = '#f97316', alto = 80, ancho = 240 }) {
  if (!datos || datos.length < 2) {
    return <div className="text-xs text-gray-500 py-4 text-center">Sin suficientes datos aún (se acumulan al avanzar la simulación)</div>
  }
  const xs = datos.map((d) => d[campoX])
  const ys = datos.map((d) => d[campoY])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs) || 1
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys) || 1
  const escalaX = (x) => ((x - minX) / (maxX - minX || 1)) * (ancho - 10) + 5
  const escalaY = (y) => alto - 5 - ((y - minY) / (maxY - minY || 1)) * (alto - 10)
  const puntos = datos.map((d) => `${escalaX(d[campoX])},${escalaY(d[campoY])}`).join(' ')

  return (
    <svg width={ancho} height={alto} className="bg-gray-800/40 rounded">
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="2" />
      <text x="4" y="12" fontSize="9" fill="#9ca3af">{campoY} máx: {maxY.toFixed(1)}</text>
    </svg>
  )
}
