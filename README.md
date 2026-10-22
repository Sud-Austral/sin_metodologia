# Simulador 3D de incendios forestales — Coigüe-1 v2.0 (solo frontend)

Implementación del `insumo/PROMPT_UNICO_SIMULADOR_3D_IA_COMPLETO.md` **sin backend, sin Ollama**:
Three.js + autómata celular KITRAL en Web Worker + IA en el navegador (WebLLM/WebGPU) con
fallback a plantillas deterministas + persistencia IndexedDB + exportaciones en el cliente.

Demo: https://sud-austral.github.io/sin_metodologia/

```bash
npm install && npm run dev      # desarrollo
npm test                        # vitest (motores, IA, endpoints, exportación)
npm run build                   # dist/
node scripts/bench_tick.mjs     # ms/tick del CA 240×240
node scripts/casos_de_uso.mjs   # transcripciones de los 8 casos (ejercicio/salidas/caso-N.md)
node scripts/endpoints.mjs      # salida válida/inválida de los 8 endpoints
```

## Arquitectura

```
src/
  motores/   kitral.js (K1–K13), rothermel.js (ROS, Byram), ca_propagacion.js (CA 13 m),
             kitral_worker.js (Web Worker), motor_worker.js (adaptador), meteorologia.js (Open-Meteo + FWI)
  lib/       descarga_dem.js (Terrarium → 13 m), cache_osm.js (Overpass + cache), db.js (IndexedDB), exportar.js
  estado/    simulacion.js (estado, recursos, proyección, estadísticas)
  ia/        contexto.js, intenciones.js, plantillas.js, webllm.js
  api/       cliente.js  ← los 8 endpoints como funciones de cliente
  escena/    escena3D.js, Terreno.js, Vegetacion.js, Ciudad.js, Fuego.js, Recursos.js
  componentes/ App.jsx, ChatPanel.jsx, ControlPanel.jsx (6 pestañas), Graficos.jsx
```

## IA local: WebLLM en vez de Ollama + Mistral-7B

| Original (spec) | Aquí |
|---|---|
| `ollama serve` + `mistral:7b-instruct-q4` | `@mlc-ai/web-llm` con `Llama-3.2-1B-Instruct-q4f16_1-MLC` (~700 MB, se descarga una vez al pulsar "Cargar IA local") |
| Detección automática de Ollama | `detectarWebGPU()`: si `navigator.gpu` no existe → badge "plantillas" y respuestas con cifras reales |
| Backend ensambla contexto | `ia/contexto.js` (mismo prompt de sistema de la Sección 7.2, recorte a 3000 chars) |
| Backend parsea intención | `ia/intenciones.js` sobre la pregunta **y** sobre la respuesta de la IA |
| Tablas `chat_conversaciones` / `chat_mensajes` | IndexedDB `coigue_sim3d` (almacenes `conversaciones`, `mensajes`, `estrategias`, `acciones`, `cache`) |

Pasos para el usuario: abrir la app en Chrome/Edge ≥ 113 (WebGPU), pulsar **Cargar IA local**, esperar la
descarga (progreso en el panel). Sin WebGPU la app funciona igual con plantillas; nunca pantalla en blanco.

## Endpoints (Sección 8.3) → `src/api/cliente.js`

Todas devuelven `{ ok, status, data }` o `{ ok:false, status, detail }` (422 validación, 404 no existe).

| Contrato | Función | Entrada |
|---|---|---|
| `POST /api/v1/chat/consultar` | `chatConsultar` | `{pregunta, simulacion_id}` → `{respuesta, timestamp, modelo, tokens_utilizados, comando, conversacion_id}` |
| `POST /api/v1/despacho/desplegar` | `despachoDesplegar` | `{simulacion_id, recurso_id, lat, lng}` → `{estado, eta_min, distancia_m, ruta}` |
| `POST /api/v1/simulacion/aplicar-retardante` | `simulacionAplicarRetardante` | `{simulacion_id, producto, volumen, zona:{lat,lng,radio_m?}}` → `{celdas_tratadas, reduccion_ros, duracion_min}` |
| `POST /api/v1/simulacion/control` | `simulacionControl` | `{simulacion_id, accion: pausar\|reanudar\|reiniciar}` |
| `GET /api/v1/chat/exportar/{id}?formato=` | `chatExportar` | `{conversacion_id, formato: pdf\|markdown\|json\|kmz\|csv, simulacion_id?}` → `{archivo, bytes, contenido}` |
| `GET /api/v1/analisis/estadisticas` | `analisisEstadisticas` | `{simulacion_id}` → series ROS/ha/altura vs tiempo, amenazadas, acciones |
| `POST /api/v1/estrategia/guardar` | `estrategiaGuardar` | `{simulacion_id, nombre?}` → snapshot + PDF (Ejemplo 5) |
| `POST /api/v1/simulacion/proyectar` | `simulacionProyectar` | `{simulacion_id, viento_kmh?, humedad?, en_min}` → actual vs proyectado (Ejemplo 3) |

La Sección 8.3 lista 6 rutas; los dos últimos se añadieron para cubrir los Ejemplos 3 y 5 (decisión documentada en `ejercicio/metadatos.json`).

## Casos de uso (Sección 9)

Ver `ejercicio/salidas/caso-1.md … caso-8.md`, generados con `node scripts/casos_de_uso.mjs` contra las funciones reales. En el navegador, escribir las mismas frases en el chat.

## Troubleshooting

- **"plantillas (sin WebGPU)"**: el navegador no expone `navigator.gpu`. Usar Chrome/Edge actualizado o aceptar el modo plantilla.
- **DEM "sintetico"**: falló Terrarium (sin red o CORS). Aparece el aviso "Usando relieve sintético, simulación es menos precisa".
- **OSM "sintetico"**: Overpass agotó 25 s o falló; se usa una villa sintética con escuela, posta y cuartel al norte del foco.
- **Grid lento**: el tick corre en Worker; reducir `dt` o desactivar pavesas. Bench de referencia en `ejercicio/salidas/bench_tick.json`.
- **La conversación no aparece al reabrir**: la clave es `simulacion_id` (derivada del nombre del escenario); IndexedDB se borra en ventanas privadas.
