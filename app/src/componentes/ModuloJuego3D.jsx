// ModuloJuego3D.jsx: wrapper React que reemplaza el ModuloJuego.jsx del
// documento fuente. Monta el canvas Three.js, carga DEM + vegetación +
// ciudad + meteorología, levanta el Web Worker del CA y conecta
// ChatPanel + ControlPanel.
import { useEffect, useRef, useState } from 'react'
import { crearEscena } from '../tres/escena3D.js'
import { cargarDEM } from '../motores/descarga_dem.js'
import { clasificarVegetacionPorPercentiles } from '../motores/kitral.js'
import { cargarCiudad } from '../motores/cache_osm.js'
import { cargarMeteo } from '../motores/meteorologia.js'
import { estado as simEstado, actualizarEstadisticas, registrarMuestraHistorial } from '../api_cliente/simEstado.js'
import ChatPanel from './ChatPanel.jsx'
import ControlPanel from './ControlPanel.jsx'

const WIDTH = 240
const HEIGHT = 240
const CELL_SIZE = 13

export default function ModuloJuego3D() {
  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const escenaRef = useRef(null)
  const gridMetaRef = useRef(null)
  const [estadoCarga, setEstadoCarga] = useState({ mensaje: 'Cargando terreno…', listo: false, error: null })
  const [msUltimoTick, setMsUltimoTick] = useState(null)

  useEffect(() => {
    let cancelado = false

    async function iniciar() {
      const dem = await cargarDEM(simEstado.lat, simEstado.lng, { width: WIDTH, height: HEIGHT, cellSize: CELL_SIZE })
      if (cancelado) return
      setEstadoCarga((s) => ({ ...s, mensaje: `DEM cargado (fuente: ${dem.fuente})` }))

      const fuelModel = clasificarVegetacionPorPercentiles(dem.dem, dem.pendienteMagnitud, WIDTH, HEIGHT)
      gridMetaRef.current = { dem: dem.dem, fuelModel, slopeX: dem.slopeX, slopeY: dem.slopeY }

      // Meteorología real (no bloqueante: si falla, se sigue con los valores por defecto)
      cargarMeteo(simEstado.lat, simEstado.lng, { dias: 1 }).then((registros) => {
        if (registros?.length) actualizarEstadisticas({ velViento: registros[0].vientoKmh, dirViento: registros[0].dirVientoGrados, humCombustible: registros[0].humedadFino })
      }).catch(() => {})

      // Ciudad (Overpass, con fallback sintético si falla)
      cargarCiudad(simEstado.lat, simEstado.lng, 3).then((osmData) => {
        escenaRef.current?.agregarCiudad(osmData, simEstado.lat, simEstado.lng)
      })

      if (canvasRef.current) {
        const escena = crearEscena(canvasRef.current, { width: WIDTH, height: HEIGHT, cellSize: CELL_SIZE, dem: dem.dem, fuelModel })
        escenaRef.current = escena

        const worker = new Worker(new URL('../motores/kitral_worker.js', import.meta.url), { type: 'module' })
        workerRef.current = worker
        worker.onmessage = (evt) => {
          const data = evt.data
          if (data.tipo === 'tick_ok') {
            setMsUltimoTick(data.msPorTick)
            actualizarEstadisticas({ minutos: data.tiempoMin, hectareas: data.hectareas })
            registrarMuestraHistorial()
            escena.actualizarDesdeCA(data)
          }
        }
        worker.postMessage({
          cmd: 'init',
          width: WIDTH,
          height: HEIGHT,
          cellSize: CELL_SIZE,
          fuelModel,
          slopeX: dem.slopeX,
          slopeY: dem.slopeY,
          filaIgnicion: Math.floor(HEIGHT / 2),
          colIgnicion: Math.floor(WIDTH / 2),
        })

        escena.onTick = () => {
          worker.postMessage({
            cmd: 'tick',
            vientoKmh: simEstado.velViento,
            vientoDir: simEstado.dirViento,
            humedad: simEstado.humCombustible,
            dt: 5,
            params: { ajusteROS: 0.7, curadoPasto: 85, factorSequia: 1.0 },
          })
        }

        escena.iniciar()
        setEstadoCarga({ mensaje: 'Simulación lista', listo: true, error: null })
      }
    }

    iniciar().catch((e) => {
      if (!cancelado) setEstadoCarga({ mensaje: 'Error al iniciar', listo: false, error: e.message })
    })

    return () => {
      cancelado = true
      escenaRef.current?.detener()
      workerRef.current?.terminate()
    }
  }, [])

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {!estadoCarga.listo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-gray-200 text-sm z-20">
          {estadoCarga.error ? `⚠️ ${estadoCarga.error}` : estadoCarga.mensaje}
        </div>
      )}

      <ChatPanel visible={estadoCarga.listo} grid={gridMetaRef.current} worker={workerRef.current} />
      <ControlPanel visible={estadoCarga.listo} grid={gridMetaRef.current} worker={workerRef.current} />

      {msUltimoTick != null && (
        <div className="absolute bottom-2 right-2 text-[10px] text-gray-500 font-mono z-10">
          tick: {msUltimoTick.toFixed(2)} ms
        </div>
      )}
    </div>
  )
}
