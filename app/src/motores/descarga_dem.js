// Carga de terreno (DEM) real desde tiles Terrarium (Sección 5.1), con
// decodificación RGB->elevación, remuestreo a la resolución del CA (13 m)
// y pendiente local. Si la red falla o no hay Canvas disponible (Node),
// cae a un DEM sintético local determinístico -- documentado explícitamente,
// nunca se oculta el fallback.

/** elev = (R*256 + G + B/256) - 32768, formato Terrarium (Sección 5.1). */
export function decodificarPixelRGB(r, g, b) {
  return r * 256 + g + b / 256 - 32768
}

/** Convierte lat/lng a coordenadas de tile slippy-map en el zoom dado. */
export function lonLatATile(lon, lat, zoom) {
  const n = 2 ** zoom
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return { x, y, z: zoom }
}

/**
 * DEM sintético determinístico (suma de senos), usado solo como fallback
 * cuando Terrarium no está disponible. No pretende ser realista, solo dar
 * una superficie con pendiente variable para que el CA no reciba un grid
 * plano con pendiente=0 en todas las celdas.
 */
export function generarDEMSintetico(width, height, seed = 1, escalaM = 180) {
  const dem = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = col / width
      const y = row / height
      const base =
        Math.sin(x * 6.283 * 1.3 + seed) * 60 +
        Math.cos(y * 6.283 * 0.9 + seed * 1.7) * 50 +
        Math.sin((x + y) * 6.283 * 2.1 + seed * 0.4) * 25
      dem[row * width + col] = 250 + base + escalaM * 0.1 * (x + y) // leve tendencia ascendente
    }
  }
  return dem
}

/**
 * Pendiente local por diferencias finitas en una ventana 3x3 (∇, Sección 5.1).
 * Retorna slopeX (este-oeste, rise/run), slopeY (norte-sur, rise/run) y la
 * magnitud de pendiente (fracción, no %).
 */
export function calcularPendiente(dem, width, height, cellSize) {
  const slopeX = new Float32Array(width * height)
  const slopeY = new Float32Array(width * height)
  const magnitud = new Float32Array(width * height)

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      const colL = Math.max(0, col - 1)
      const colR = Math.min(width - 1, col + 1)
      const rowU = Math.max(0, row - 1)
      const rowD = Math.min(height - 1, row + 1)

      const dzdx = (dem[row * width + colR] - dem[row * width + colL]) / ((colR - colL) * cellSize || 1)
      // y positivo = norte; en el array row crece hacia el sur, por eso el signo se invierte
      const dzdy = (dem[rowU * width + col] - dem[rowD * width + col]) / ((rowD - rowU) * cellSize || 1)

      slopeX[idx] = dzdx
      slopeY[idx] = dzdy
      magnitud[idx] = Math.hypot(dzdx, dzdy)
    }
  }
  return { slopeX, slopeY, magnitud }
}

/** Remuestreo simple (nearest-neighbor) de un DEM de origen a width x height destino. */
export function remuestrear(demOrigen, widthOrigen, heightOrigen, widthDestino, heightDestino) {
  const destino = new Float32Array(widthDestino * heightDestino)
  for (let row = 0; row < heightDestino; row++) {
    for (let col = 0; col < widthDestino; col++) {
      const srcCol = Math.min(widthOrigen - 1, Math.floor((col / widthDestino) * widthOrigen))
      const srcRow = Math.min(heightOrigen - 1, Math.floor((row / heightDestino) * heightOrigen))
      destino[row * widthDestino + col] = demOrigen[srcRow * widthOrigen + srcCol]
    }
  }
  return destino
}

/**
 * cargarDEM: intenta descargar un tile Terrarium real centrado en (lat,lng),
 * decodificarlo y remuestrearlo a widthxheight celdas de cellSize metros.
 * Si falla por cualquier motivo (red, CORS, sin Canvas/OffscreenCanvas
 * disponible como en Node), cae a generarDEMSintetico y lo deja explícito
 * en el campo `fuente` del resultado.
 */
export async function cargarDEM(lat, lng, { width = 240, height = 240, cellSize = 13, zoom = 13, timeoutMs = 7000 } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let dem
  let fuente
  let error = null

  try {
    if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      throw new Error('Entorno sin fetch/Canvas (Node/worker sin soporte) — se usa DEM sintético')
    }
    const { x, y, z } = lonLatATile(lng, lat, zoom)
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
    // IMPORTANTE (hallazgo real de este ejercicio, ver EQUIVOCACIONES.md):
    // fetch() NO tiene timeout propio. En redes restringidas/sandboxeadas la
    // conexión puede quedar colgada indefinidamente en vez de fallar rápido,
    // lo que deja la UI pegada en "Cargando terreno…" para siempre. Por eso
    // se agrega un AbortController con timeout explícito.
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    let resp
    try {
      resp = await fetch(url, { signal: controller?.signal })
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (!resp.ok) throw new Error(`Terrarium HTTP ${resp.status}`)
    const blob = await resp.blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

    const demTile = new Float32Array(bitmap.width * bitmap.height)
    for (let i = 0; i < demTile.length; i++) {
      const o = i * 4
      demTile[i] = decodificarPixelRGB(data[o], data[o + 1], data[o + 2])
    }
    dem = remuestrear(demTile, bitmap.width, bitmap.height, width, height)
    fuente = 'terrarium'
  } catch (e) {
    error = e.message
    dem = generarDEMSintetico(width, height)
    fuente = 'sintetico'
  }

  const { slopeX, slopeY, magnitud } = calcularPendiente(dem, width, height, cellSize)
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  return {
    dem,
    slopeX,
    slopeY,
    pendienteMagnitud: magnitud,
    width,
    height,
    cellSize,
    fuente,
    error,
    msCarga: t1 - t0,
  }
}
