# Verificación — Simulador 3D Incendios (modo "sin metodología")

Cada afirmación de este documento está respaldada por un comando real y
una salida real guardada en `ejercicio/salidas/`. Donde no se pudo
verificar algo, se dice explícitamente "NO COMPROBADO" y por qué — nunca
se asume que algo "debería funcionar".

Comandos base (reproducibles desde `D:\GitHub\sin_metodologia\app`):

```bash
npm install
npm run dev              # servidor de desarrollo
npm run build             # build de producción
npm test                  # Vitest (15 pruebas)
node ../ejercicio/bench_tick.mjs                  # benchmark del motor CA (desde la raíz del repo)
node scripts/harness_funciones_cliente.mjs        # las 8 funciones cliente, salida real
node scripts/casos_de_uso.mjs                     # los 8 casos de uso, salida real
node scripts/verificar_browser.mjs                # verificación con Chromium real (requiere dev server en :5180)
```

---

## 1. Motor de simulación (CA / KITRAL / Rothermel)

### Rendimiento: <100 ms/tick en grid 240×240

**Comando**: `node ejercicio/bench_tick.mjs`
**Salida real** (`ejercicio/salidas/bench_tick_salida.json`):
```json
{
  "grid": "240x240",
  "n_ticks": 60,
  "ms_por_tick_avg": 0.116,
  "ms_por_tick_max": 0.655,
  "ms_por_tick_min": 0.024,
  "hectareas_quemadas_final": 16.29
}
```
**Veredicto**: VERIFICADO. 0.116 ms/tick promedio, muy por debajo de 100 ms.
También se vio en vivo en el navegador real (ver sección 4): la UI
muestra "tick: 0.00–0.20 ms" sobre el canvas.

### Pruebas unitarias del motor

**Comando**: `npm test` (desde `app/`)
**Salida real** (`ejercicio/salidas/pruebas_exitosas.txt`): `Test Files 2
passed (2)`, `Tests 15 passed (15)`.
**Veredicto**: VERIFICADO. Cubre: creación de grid, ignición, propagación
con viento favorable (la superficie crece), NO propagación cuando la
humedad ≥ humedad de extinción del modelo (ROS→0), perímetro/frente como
subconjuntos válidos del grid, conteo exacto de hectáreas, y 8 casos del
parseador de intenciones.

### Prueba de mutación (exigida por la consigna)

**Comando**: edición deliberada en `rothermel.js` (`ros = 0 * ...`) +
`npm test`, luego revertir + `npm test`.
**Salida real (rota)** (`ejercicio/salidas/pruebas_mutacion_fallida.txt`):
`AssertionError: expected 0.0169 to be greater than 0.0169` — 1 test
falla.
**Salida real (revertida)** (`ejercicio/salidas/pruebas_exitosas.txt`):
15/15 en verde.
**Veredicto**: VERIFICADO. La suite detecta la mutación.

### Fallo real NO deliberado y su corrección

**Comando**: primera corrida de `npm test` tras escribir
`intenciones.test.js`.
**Salida real** (`ejercicio/salidas/pruebas_fallida_guardar_accento.txt`):
1 test falla (`"Guardá"` con tilde no reconocido).
**Corrección**: ver `ejercicio/EQUIVOCACIONES.md` #1.
**Veredicto**: VERIFICADO (corregido, re-probado en verde).

---

## 2. Build y dev server

**Comando**: `npm run build`
**Salida real** (`ejercicio/salidas/build_salida.txt`): `✓ 413 modules
transformed`, `✓ built in ~1-3s`, sin errores. Tamaño total de `dist/`:
**7769 KB** (incluye el runtime de `@mlc-ai/web-llm`, que es
intrínsecamente grande).
**Veredicto**: VERIFICADO — build sin errores.

**Comando**: `npm run dev` + `curl http://localhost:5180/`
**Salida real**: `HTTP:200`. Se transformaron sin error
`src/main.jsx`, `src/componentes/ModuloJuego3D.jsx`, `ChatPanel.jsx`,
`ControlPanel.jsx` (HTTP 200 en cada uno, sin "Internal Server Error").
**Veredicto**: VERIFICADO — el dev server sirve la app sin errores de
transformación.

---

## 3. Grep de secretos

**Comando**: `grep -rniE "api[_-]?key|secret|token|password" app/src app/scripts`
**Salida real** (`ejercicio/salidas/grep_secretos.txt`): únicamente
coincidencias con `tokensUtilizados` / `tokens_utilizados` (conteo de
tokens del LLM, no un secreto).
**Veredicto**: VERIFICADO — sin secretos en el código (`secretos_en_codigo: false`).

---

## 4. Verificación con navegador real (Chromium vía Playwright)

**Comando**: `node scripts/verificar_browser.mjs` (dev server en `:5180`)
**Salida real completa**: `ejercicio/salidas/verificacion_browser.json`,
captura: `ejercicio/salidas/captura_pantalla.png`.

| Comprobación | Resultado real | Veredicto |
|---|---|---|
| La página carga y `#root` existe | `tieneRoot: true` | VERIFICADO |
| Sin errores fatales de consola | `erroresConsola: 0` (array `erroresConsolaCompletos` vacío) | VERIFICADO |
| Nunca pantalla en blanco | `bodyNoVacio: true`, texto real visible | VERIFICADO |
| `navigator.gpu` existe | `webgpuDisponible: true` | VERIFICADO |
| WebGPU real (adaptador) no disponible en este sandbox → fallback visible | Mensaje real en pantalla: *"No se pudo inicializar WebLLM: Unable to find a compatible GPU..."*, badge `plantilla-local` | VERIFICADO (fallback funciona, nunca deja la UI rota) |
| Envío de mensaje de chat real | Se escribió "¿Cuál es el ROS actual?", respuesta real: *"El ROS (Rate of Spread) actual es 8.2 m/min..."* | VERIFICADO |
| Persistencia IndexedDB sobrevive un `page.reload()` real | Antes: `dbsAntes: ["simulador3d_coigue"]`. Después del reload: mensaje y respuesta siguen visibles en el DOM (`tras_reload.muestraTexto` incluye la pregunta y la respuesta completas) | VERIFICADO (`persistencia_recupera_al_reabrir: true`) |
| FPS (requestAnimationFrame durante 3s) | Valores observados en corridas repetidas: 3.3, 60.6, 4.3, 60.6, 3.3, 4.0 | MEDIDO PERO NO REPRESENTATIVO — Chromium headless sin GPU real (ver `webgpu` arriba: "No available adapters"), alta variancia por contención de CPU con el intento de inicializar WebGPU. NO sirve como benchmark de "≥30 FPS en Intel HD 630" del MVP. |
| Captura de pantalla | `ejercicio/salidas/captura_pantalla.png` (1280×720, PNG real) muestra terreno coloreado con vegetación, ChatPanel con conversación real, ControlPanel con 6 pestañas | VERIFICADO visualmente (una captura, estado inicial de la simulación) |

### Bug real encontrado y corregido durante esta verificación

`cargarDEM`/`cargarMeteo` sin timeout dejaban la app colgada en "Cargando
terreno…" indefinidamente en este sandbox de red. Ver
`ejercicio/EQUIVOCACIONES.md` #3. Corregido con `AbortController`,
re-verificado con el mismo script: la app carga y responde.

### Medición de `cargarDEM` aislada (fuente real vs fallback)

**Comando**: `page.evaluate` invocando `cargarDEM()` directamente, 4
corridas.
**Salida real**: `{"fuente":"terrarium","msCarga":1552.6}`,
`{"fuente":"terrarium","msCarga":437.8}`,
`{"fuente":"terrarium","msCarga":1540}`,
`{"fuente":"terrarium","msCarga":436}`.
**Veredicto**: VERIFICADO — en la mayoría de las corridas el DEM real se
descarga en 436–1553 ms. En una corrida anterior (antes del fix de
timeout) la conexión colgó más de 20 s sin fallar ni tener éxito,
confirmando que ambos caminos (éxito Terrarium / fallback sintético) son
reales y necesarios, no solo teóricos.

---

## 5. Las 8 funciones cliente (equivalentes a los endpoints de la Sección 8.3)

**Comando**: `node scripts/harness_funciones_cliente.mjs`
**Salida real completa**: `ejercicio/salidas/funciones_cliente_salida.json`

| # | Función cliente | Contrato HTTP original citado | Resultado real | Veredicto |
|---|---|---|---|---|
| 1 | `despachoDesplegar` | `POST /api/v1/despacho/desplegar {recurso_id, lat, lng}` | `{"recursoId":"R-22","distanciaKm":1.75,"etaMin":4.2,"estado":"en_transito"}` | VERIFICADO |
| 2 | `despachoEta` (inferida) | — (necesaria para los casos de uso) | `{"recursoId":"H-01","distanciaKm":...,"etaMin":...}` | VERIFICADO |
| 3 | `simulacionAplicarRetardante` | `POST /api/v1/simulacion/aplicar-retardante {producto, volumen, zona}` | `{"reduccionROSPct":35,"duracionHoras":4}` | VERIFICADO |
| 4 | `simulacionControl` (pausar) | `POST /api/v1/simulacion/control {accion}` | `{"accion":"pausar","pausado":true}` | VERIFICADO |
| 5 | `simulacionControl` (reanudar) | ídem | `{"accion":"reanudar","pausado":false}` | VERIFICADO |
| 6 | `chatConsultar` (pregunta simple) | `POST /api/v1/chat/consultar` | respuesta con ROS real 8.2 m/min, modelo `fallback-template-local` | VERIFICADO (fallback; WebLLM real no_comprobado) |
| 7 | `chatConsultar` (comando desplegar) | ídem | `comandoEjecutado.accion = "desplegar_recurso"` con ETA real | VERIFICADO |
| 8 | `chatGuardarEstrategia` (inferida) | — (necesaria para casos de uso 5 y 7) | guardado real en IndexedDB (fake-indexeddb), `id:1` | VERIFICADO |
| 9 | `analisisEstadisticas` | `GET /api/v1/analisis/estadisticas` | series `serieROS`/`serieHectareas` con 14 puntos reales | VERIFICADO |
| 10 | `chatExportar` (markdown) | `GET /api/v1/chat/exportar/{id}?formato=markdown` | 693 bytes, contenido real con "Tiempo transcurrido: 65 min" (tras corregir bug #4) | VERIFICADO |
| 11 | `chatExportar` (csv) | ídem, formato csv | 203 bytes CSV real (Papaparse) | VERIFICADO |
| 12 | `chatExportar` (kmz) | ídem, formato kmz | 698 bytes, ZIP "store" válido (CRC32 calculado) | VERIFICADO el formato binario; NO comprobado abriéndolo en Google Earth/QGIS real |

`chatExportar` con `formato: 'pdf'` también se probó en el harness: como
Node no tiene DOM, devolvió `{"nombreArchivo":null,"nota":"Se requiere un
nodoDOM real..."}` — comportamiento correcto y documentado, pero la
generación real de bytes PDF con `html2canvas`+`jsPDF` **no se verificó**
con un DOM real (ni en el harness ni en la corrida de Playwright, que no
hizo clic en el botón "Exportar PDF" del ControlPanel). Ver
`no_comprobado`.

---

## 6. Los 8 casos de uso de la Sección 9

**Comando**: `node scripts/casos_de_uso.mjs`
**Salida real**: `ejercicio/salidas/caso-1.md` … `caso-8.md`

| Caso | Título | Estado | Nota |
|---|---|---|---|
| 1 | Lectura simple (ROS) | REPRODUCIDO | Respuesta real con ROS/viento/humedad reales |
| 2 | Control — Desplegar Brigada | REPRODUCIDO | `comandoEjecutado` real con ETA calculada |
| 3 | Proyección alternativa | REPRODUCIDO | Tabla con ROS actual vs proyectado, calculado con `calcularROS()` real (no inventado) |
| 4 | Análisis estratégico | REPRODUCIDO (parcial) | Respuesta genérica de plantilla; no compara explícitamente "frente norte" vs "flanco este" con cifras separadas por flanco (el motor no divide el frente por flanco en esta implementación) |
| 5 | Guardado de decisión | REPRODUCIDO | Guardado real en IndexedDB, snapshot con recursos reales |
| 6 | Análisis de amenaza (Puerto Montt) | REPRODUCIDO | ETA calculado con distancia real (18.5 km) y ROS real |
| 7 | Multi-turno | REPRODUCIDO (con hallazgo honesto) | 3 turnos reales; el 2º turno ("¿Y retardante por tierra?") disparó el comando `aplicar_retardante` por ser detección de palabra clave — ver `EQUIVOCACIONES.md` #6 |
| 8 | Exportación inteligente | REPRODUCIDO (parcial) | El comando `exportar` se ejecuta; el PDF real no se generó (requiere DOM, ver sección 5) |

**Veredicto global**: los 8 casos están reproducidos con la implementación
real (parseo de intención + ejecución de función cliente + respuesta),
tal como pide la consigna ("si el LLM pequeño no da exactamente la misma
respuesta ilustrativa, está bien"). Ninguna transcripción fue inventada;
todas son la salida literal de `chatConsultar()`.

---

## 7. Checklist Mínimo (MVP) — veredicto por ítem

| Ítem del MVP | Comando / evidencia | Veredicto |
|---|---|---|
| DEM carga sin error (cualquier zona Los Lagos) | Sección 4 (Playwright), ambos caminos reales | VERIFICADO |
| KITRAL CA ejecuta en <100 ms/tick (240×240) | Sección 1, 0.116 ms/tick | VERIFICADO |
| ChatPanel visible, sin crashes | Sección 4, captura de pantalla + 0 errores de consola | VERIFICADO |
| "Ollama" detecta automáticamente (adaptado a WebGPU) o fallback amigable | Sección 4, mensaje de fallback real y claro | VERIFICADO (adaptado) |
| Pregunta simple responde en <3 segundos | Harness: respuesta fallback en <1 ms | VERIFICADO (fallback); WebLLM real NO COMPROBADO (sin GPU en este entorno) |
| Comando "desplegar" ejecuta (brigada visible en mapa) | Ejecuta sí (Sección 5/6). "Visible en el mapa 3D" — **NO HECHO**: no se implementó un marcador 3D para recursos desplegados en `escena3D.js` | PARCIAL (ejecución sí, visualización 3D del recurso no) |
| Conversación se guarda en BD (recuperable) | Sección 4, IndexedDB sobrevive reload real | VERIFICADO |
| Exportar markdown genera archivo descargable | `descargarArchivo()` usa `Blob`+`URL.createObjectURL` (API real de navegador); en Node (harness) correctamente retorna `false` por no haber `document` | VERIFICADO el contenido; la descarga en sí (clic real) NO se automatizó en Playwright |
| Sin crashes al cambiar de pestaña | Código revisado (las 6 pestañas son un `switch` controlado por `useState`), NO se automatizó un clic por pestaña en Playwright | NO COMPROBADO end-to-end (solo revisión de código) |
| ≥30 FPS en GPU Intel HD 630 (benchmark) | Sección 4, FPS medidos 3.3–60.6 en Chromium headless sin GPU real | NO COMPROBADO (no hay hardware Intel HD 630 disponible en este entorno; la medición obtenida no es representativa) |
| Latencia IA <3 segundos (adaptado a WebLLM local) | Fallback sí (<1s). WebLLM real: NO COMPROBADO (sin adaptador WebGPU en este entorno) |

---

## 8. Timeline de 8 semanas — ver `metadatos.json` → `timeline`

El detalle casilla por casilla (25 ítems) está en `metadatos.json` para
mantenerlo máquina-legible; el resumen narrativo está en el reporte
final entregado al usuario.
