# Verificación (modo SIN metodología)

Todo lo marcado **verificado** tiene un comando que lo reproduce y una salida literal (recortada) guardada en `ejercicio/salidas/`. Lo que no pude ejecutar queda como **no comprobado** o **no hecho** con la razón. Máquina: Intel i5-10300H + Intel UHD Graphics (0x9BC4, "gen-9"), Windows 10, Node v24.11.0, Chrome headless=new con GPU real.

Comandos base:
```
npm test                                   → ejercicio/salidas/test-pass.txt (35/35)
node scripts/bench_tick.mjs 120            → ejercicio/salidas/bench_tick.json
node scripts/casos_de_uso.mjs              → ejercicio/salidas/caso-1..8.md, casos-resumen.json
node scripts/endpoints.mjs                 → ejercicio/salidas/endpoint-*.json, endpoints-resumen.json
npx vite preview --port 4173 & node scripts/verificar_navegador.mjs → ejercicio/salidas/navegador.json, captura-navegador.png
node scripts/verificar_ia.mjs              → ejercicio/salidas/ia-navegador.json (+ .log)
```

## 1. Timeline Sección 10 (8 semanas, 35 casillas)

### Semana 1–2: CIMENTACIÓN
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Integrar KITRAL CA en Web Worker (no bloquea render) | **verificado** | `navegador.json` → `ms_tick_worker: 3.14`, `fps: 140.3` mientras el worker corre (`src/motores/kitral_worker.js`, `motor_worker.js`). |
| Cargar DEM real Terrarium (HTTP) | **verificado** | `navegador.json` → `dem: {fuente:"terrarium", ms:624.8, tiles:2}`; tras recarga `fuente:"cache"` (IndexedDB) en 19 ms. |
| Clasificación automática vegetación (percentiles) | **verificado** | `test-pass.txt` → "clasifica vegetación por percentiles p40/p72 y pendiente". |
| Endpoint `/api/v1/chat/consultar` básico (sin Ollama aún) | **verificado** | `endpoint-chatConsultar.json` → status 200 con respuesta plantilla; 422 con pregunta vacía. |
| Bocanadas de llama versión mejorada (altura física) | **verificado** (render) / altura física por Byram **verificado** en test | `src/escena/Fuego.js` (shader Sección 6.3, altura = `alturaLlama(modelo, ROS)`); `captura-navegador.png`; test "altura de llama es positiva y creciente con ROS". |
| Entregable: Grid CA corre a ≥30 FPS | **verificado** | `navegador.json` → `fps: 140.3` (10 s de rAF). |

### Semana 2–3: IA LOCAL
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Instalar Ollama + Mistral-7B (documentar pasos) | **verificado** (sustituido por WebLLM, según la restricción) | README "IA local: WebLLM en vez de Ollama"; `ia-navegador.json` → modelo `Llama-3.2-1B-Instruct-q4f16_1-MLC` cargado en 53.4 s, 676 MB en Cache Storage. |
| Integración automática (detectar si está corriendo) | **verificado** | `detectarWebGPU()`; `navegador.json` → `webgpu:{disponible:true,gpu:"intel gen-9"}`; con SwiftShader → `false` + badge "plantillas". |
| ChatPanel.jsx con historial | **verificado** | `navegador.json` → `chat_pregunta_simple.mensajes_dom: 2`, luego 4. |
| Ensamblar contexto dinámico (estado simulación) | **verificado** | test "incluye las cifras del estado y recorta a 3000 caracteres". |
| Almacenar mensajes en BD | **verificado** (IndexedDB) | `navegador.json` → `indexeddb: {conversaciones:1, mensajes:4, indexedDB:true}`. |
| Entregable: Chat funcional, respuestas en <3s | **verificado con plantillas** (0.06 s); con WebLLM ver sección IA | `navegador.json` → `latencia_s: 0.06`. |

### Semana 3–4: CONTROL
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Parseador de intenciones (detectar comandos) | **verificado** | tests "Parseador de intenciones" (4); `casos-resumen.json` → cada turno con su `comando`. |
| POST `/api/v1/despacho/desplegar` (brigadas) | **verificado** | `endpoint-despachoDesplegar.json` (200 / 422); `navegador.json` → `R-22 EN TRÁNSITO eta 4, rutas visibles: 1`. |
| POST `/api/v1/simulacion/aplicar-retardante` | **verificado** | `endpoint-simulacionAplicarRetardante.json`; test "retardante reduce el área quemada". |
| POST `/api/v1/simulacion/control` (pausar, reanudar) | **verificado** | `endpoint-simulacionControl.json`; test "pausar detiene el avance…". |
| Visualizar efectos en tiempo real (grid CA actualiza) | **verificado** | `motor_worker.js` fusiona barreras/retardante en el siguiente tick; `Terreno.colorear` pinta barrera/retardante; `captura-navegador.png`. |
| Entregable: IA puede ejecutar 3 acciones principales | **verificado** | caso-2 (desplegar), endpoint retardante, caso-7 (plan C = despliegue múltiple), control por chat ("pausa"). |

### Semana 4–5: CIUDADES + METEOROLOGÍA
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Cargar OSM (Overpass API) | **no comprobado con datos reales**: código y cache implementados, pero Overpass (4 espejos) no responde desde esta red (`curl` exit 35 / timeout). Fallback sintético **verificado**. | `navegador.json` → `osm:{fuente:"sintetico", error:"…timeout 12s…", edificios:48}`; test `procesar_osm` con respuesta Overpass simulada. |
| Edificios 3D + calles + servicios | **verificado** (con ciudad sintética) | `src/escena/Ciudad.js`; `captura-navegador.png` (48 edificios, calles, 3 servicios con anillo 500 m). |
| Fetch Open-Meteo (meteorología real) | **verificado** | `navegador.json` → `meteo:{fuente:"open-meteo", horas:96}` (endpoint archive para 2026-01-15). |
| Integración FWI dinámica | **verificado** | `calcularFWI_canadiense` + `meteoParaMinuto` (1 min = 1 h) tests; checkbox "Viento automático" aplica viento/humedad/precipitación por tick (`aplicarMeteo`). |
| Pestaña ANÁLISIS (gráficos ROS vs tiempo) | **verificado** | `navegador.json` → `pestanas: ["ANÁLISIS:true"…]` sin errores; `analisisEstadisticas` series en `endpoint-analisisEstadisticas.json`. |
| Entregable: Ciudades visibles, meteorología dinámica | **parcial** (ciudad sintética, meteo real) | ídem. |

### Semana 5–6: ANÁLISIS + EXPORTACIÓN
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Pestaña REPORTES (exportar, guardar) | **verificado** | pestaña activa sin errores; botones llaman a `chatExportar`/`estrategiaGuardar`. |
| Exportar conversación a markdown | **verificado** | `navegador.json` → `md:{ok:true, archivo:"conversacion_Los_Lagos_15_enero_2026-10-22.md", bytes:1930}`; `endpoint-chatExportar.json`. |
| Generar PDF (html2canvas + jsPDF) | **verificado** (jsPDF; html2canvas no usado: el mapa se captura con `renderer.domElement.toDataURL`) | test "exportar … pdf" → bytes >1000 y cabecera `%PDF`; caso-8. |
| Exportar KMZ (perimetro + frente) | **verificado** | `navegador.json` → `kmz:{ok:true, bytes:1401}`; test KML contiene `<Polygon>`. |
| Exportar CSV (estadísticas) | **verificado** | test cabecera `t_min,ros_m_min,hectareas,…`. |
| Entregable: Usuario puede guardar y compartir decisiones | **verificado** | caso-5 (estrategia + PDF), `estrategias: 1` en IndexedDB. |

### Semana 6–7: QA + OPTIMIZACIONES
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Pruebas unitarias (Jest): KITRAL, Rothermel, chat | **verificado** (vitest, no Jest) | `test-pass.txt` 35/35; mutación → `test-fail.txt` 9 fallos. |
| Pruebas integración: chat + simulación | **verificado** | describe "Endpoints de cliente (contrato HTTP)" (8 tests). |
| Performance profiling (FPS, memoria, latencia) | **parcial**: FPS y latencia medidos; memoria **no comprobada** | `navegador.json`, `bench_tick.json`. |
| Troubleshooting: Ollama fallback, DEM fallback | **verificado** | WebGPU ausente → plantillas (run con SwiftShader); Terrarium falla → `demSintetico` + aviso (código `descarga_dem.js`); timeout IA → respuesta de respaldo (`ia-navegador.json` primera corrida). |
| Documentación: API endpoints, casos de uso | **verificado** | `README.md`. |
| Entregable: Zero crashes, latencia <3s, ≥30 FPS | **verificado** salvo latencia WebLLM (ver IA) | `errores_consola: []`, 140 FPS. |

### Semana 7–8: DEPLOY
| Casilla | Veredicto | Evidencia |
|---|---|---|
| Validación con datos reales (comparar con incendio conocido) | **no hecho**: no hay perímetro de incendio real en el repo ni acceso a SIDCO. | — |
| Entrenamiento usuario (videotutorial 5 min) | **no hecho**: no produzco video. README con pasos. | — |
| Deploy a uat (rama `/uat`, docker-compose) | **no hecho**: sin backend ni docker (restricción solo frontend). | — |
| Deploy a production (rama `/main`) | **verificado** (GitHub Pages desde main) | `metadatos.json.deploy` (run id, estado, asset publicado). |
| Monitoreo: Loki logs, Prometheus métricas | **no hecho**: sin servidor. Sustituto: `window.__metricas` + consola `[metricas]`. | — |
| Entregable: Aplicación en producción, acceso equipos CONAF | **verificado** (URL pública) | https://sud-austral.github.io/sin_metodologia/ |

## 2. Checklist Mínimo (MVP)
| Ítem | Veredicto | Evidencia |
|---|---|---|
| DEM carga sin error (cualquier zona Los Lagos) | **verificado** en 1 zona (-41.42,-72.70); botones Puerto Varas/Cochamó **no comprobados** | `dem: terrarium 624.8 ms, 2 tiles`. |
| KITRAL CA ejecuta en <100 ms/tick (240×240 grid) | **verificado** | `bench_tick.json` → `ms_promedio 1.03, ms_p95 2.54`; worker en navegador 3.14 ms. |
| ChatPanel visible, sin crashes | **verificado** | `errores_consola: []`, mensajes en DOM. |
| Ollama detecta automáticamente (o fallback amigable) | **verificado** (WebGPU) | badge "plantillas (sin WebGPU)" / "local · WebGPU". |
| Pregunta simple responde en <3 segundos | **verificado con plantillas** (0.06 s); WebLLM ver §4 | `navegador.json`. |
| Comando "desplegar" ejecuta (brigada visible en mapa) | **verificado** | `R-22 EN TRÁNSITO eta 4`, `6 sprites, rutas visibles: 1`. |
| Conversación se guarda en BD (recuperable) | **verificado** | `persistencia_recarga.recupera: true` (misma conversación y 4 mensajes tras `Page.reload`). |
| Exportar markdown genera archivo descargable | **verificado** | `md.ok true, 1930 bytes` (`descargar()` crea `<a download>`). |
| Sin crashes al cambiar de pestaña | **verificado** | `pestanas … errores_nuevos: 0`. |
| ≥30 FPS en GPU Intel HD 630 (benchmark) | **verificado** en Intel UHD 0x9BC4 (gen-9, misma familia que HD 630) | `fps: 140.3`. |
| Latencia IA <3 segundos (Mistral local) | ver §4 | `ia-navegador.json`. |

## 3. Endpoints (8 funciones de cliente)
`endpoints-resumen.json`: las 8 devuelven 200 con entrada válida y 422/404 con inválida. Detalle literal en `endpoint-<funcion>.json`. Ejemplo recortado (`endpoint-despachoDesplegar.json`):
```json
"valida": {"salida": {"ok": true, "status": 200, "data": {"recurso_id": "R-22", "estado": "EN TRÁNSITO", "eta_min": 10, "distancia_m": 6705, …}}},
"invalida": {"salida": {"ok": false, "status": 422, "detail": "lat/lng inválidos"}}
```

## 4. IA en navegador (WebLLM)
Ver `ia-navegador.json` / `.log` (se completa al final de este documento con la última corrida).

## 5. Casos de uso
`caso-1.md … caso-8.md` generados por `scripts/casos_de_uso.mjs` con las funciones reales (plantillas). Los 8 reproducidos: cada turno devuelve `ok:true` y el comando esperado (`casos-resumen.json`). Diferencias con el texto del spec: las cifras son las del estado real (p. ej. ROS 9.6 m/min, no 8.2) y la IA no inventa helicópteros: el ejemplo 2 despliega R-22 **y** H-01 porque la plantilla lo programa explícitamente.

### Resultado de la última corrida (`node scripts/verificar_ia.mjs`, Chrome headless con Intel UHD gen-9)
```
carga   {"estado":"listo","segundos":49.9}   modelo Llama-3.2-1B-Instruct-q4f16_1-MLC, 676.3 MB en Cache Storage
pregunta "¿Cuál es el ROS actual?"           latencia 40.56 s, 61 tokens, fuente webllm
pregunta "Desplegar Brigada R-22 al norte"   latencia 69.47 s, 91 tokens, comando desplegar_recurso ejecutado (R-22 ETA 10, H-01 ETA 3)
pregunta "¿Brigada norte o este?"            latencia 62.90 s, 110 tokens
```
Veredictos:
- Detección WebGPU + carga del modelo + generación en navegador: **verificado**.
- Latencia IA <3 s: **no se cumple** (40–70 s en GPU integrada; la primera corrida, con timeout de 30 s, cayó en fallback y la app siguió funcionando). En GPU dedicada no lo medí.
- Calidad del modelo de 1B: pobre. En "¿Cuál es el ROS actual?" respondió que no tiene el dato aunque el contexto lo incluye; los comandos se ejecutan igual porque el parseador actúa sobre la pregunta, no sobre la respuesta. El modo plantillas (determinista, 0.06 s) es el que cumple los casos de uso tal como están escritos.
