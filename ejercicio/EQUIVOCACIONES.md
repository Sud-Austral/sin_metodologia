# Equivocaciones reales de este ejercicio (modo "sin metodología")

Registro honesto de cada error real encontrado durante la construcción,
con hora aproximada (zona horaria America/Santiago, -03:00, tomada de los
timestamps de commit de `git log --date=iso-strict`), clasificación
(error propio / infraestructura / reintento) y cómo se detectó y corrigió.
No se omite ninguno a propósito. Si algo no aparece aquí es porque no
ocurrió -- se sabe porque cada paso de verificación (tests, build, harness,
navegador real) quedó con salida guardada en `ejercicio/salidas/` y
revisada antes de seguir.

---

## 1. Bug propio: `\b` falla como límite de palabra tras una vocal acentuada

- **Hora aproximada**: 2026-10-21 ~19:13 -03:00 (antes del commit `f32d8a2`)
- **Clasificación**: error propio (regex)
- **Cómo se detectó**: al correr `npm test` por primera vez sobre
  `src/ia/intenciones.test.js`, el test `detecta "guardar estrategia"`
  falló con `TypeError: Cannot read properties of null (reading 'accion')`.
  Salida completa: `ejercicio/salidas/pruebas_fallida_guardar_accento.txt`.
- **Causa real**: en JavaScript, sin el flag `/u`, el carácter `á` no
  pertenece a la clase `\w` (que es ASCII-only: `[A-Za-z0-9_]`). El patrón
  `\b(guarda|guardá|guardar)\b` usa `\b` como límite final; tras la "á" de
  "Guardá", tanto "á" como el espacio siguiente son "no-\w", así que **no
  hay transición de frontera** y `\b` no matchea. El regex nunca
  reconocía "Guardá" (con tilde) al final de la palabra.
- **Corrección**: se reemplazó el `\b` final por un lookahead manual
  `(?=[^a-zA-Z0-9]|$)` en `app/src/ia/intenciones.js`. Se volvió a correr
  `npm test`: las 15 pruebas pasan
  (`ejercicio/salidas/pruebas_exitosas.txt`).
- **Reintentos**: 1 (edición + re-ejecución de la suite).

## 2. Mutación deliberada (verificación exigida, no un error real)

- **Hora aproximada**: 2026-10-21 ~19:14 -03:00
- **Clasificación**: N/A (ejercicio de verificación, no una equivocación)
- **Qué se hizo**: se forzó `const ros = 0 * modelo.ros0 * fv * fp * fh` en
  `app/src/motores/rothermel.js` a propósito, se corrió `npm test` y se
  confirmó que la suite lo detecta (`ejercicio/salidas/pruebas_mutacion_fallida.txt`,
  1 test rojo: "el fuego avanza y la superficie crece"). Se revirtió el
  cambio y se re-confirmaron las 15 pruebas en verde.

## 3. Bug propio expuesto por infraestructura: `fetch()` sin timeout cuelga la UI indefinidamente

- **Hora aproximada**: 2026-10-21 ~19:28–19:31 -03:00 (durante la
  verificación con Playwright, antes de terminar el commit `257917d`)
- **Clasificación**: error propio (falta de manejo defensivo), expuesto
  por una condición de infraestructura (red restringida dentro del
  Chromium lanzado por Playwright en este entorno)
- **Cómo se detectó**: al verificar la app con un navegador Chromium real
  (`app/scripts/verificar_browser.mjs`), la página quedó pegada en
  "Cargando terreno…" más de 20 segundos sin avanzar. Se instrumentó
  `ModuloJuego3D.jsx` con `console.info` temporales y se confirmó que
  `cargarDEM()` nunca resolvía. Una prueba aislada con
  `page.evaluate(() => fetch(...))` confirmó que, navegando a
  `http://localhost:5180/` (NO desde `about:blank`), el `fetch` a
  Terrarium quedaba colgado indefinidamente en vez de fallar rápido
  (`signal is aborted without reason` recién tras un `AbortController`
  manual de prueba a los 5000 ms). `curl` desde la terminal sí llegaba a
  Terrarium sin problema, así que es una restricción específica del
  proceso del navegador en este sandbox, no una caída real del servicio.
- **Causa real**: ni `cargarDEM` (`descarga_dem.js`) ni `cargarMeteo`
  (`meteorologia.js`) tenían ningún timeout propio en su `fetch`; el
  código confiaba en que la red fallara rápido (como hace normalmente)
  para activar el `catch` y el fallback. En un entorno de red más
  restringido, esa suposición es falsa.
- **Corrección**: se agregó `AbortController` con timeout explícito
  (7000 ms) a ambas funciones. Se repitió la verificación con Playwright:
  la app ahora carga, muestra el ChatPanel y el panel de control
  correctamente (`ejercicio/salidas/verificacion_browser.json`,
  `ejercicio/salidas/captura_pantalla.png`). En corridas posteriores el
  fetch a Terrarium a veces SÍ tuvo éxito (437–1552 ms, `fuente:
  "terrarium"`) y otras veces no (cae a `fuente: "sintetico"`) -- ambos
  caminos quedaron verificados reales, no solo uno teórico.
- **Reintentos**: varias corridas de `node scripts/verificar_browser.mjs`
  (al menos 5) hasta aislar la causa; 1 corrección de código.

## 4. Bug propio: inconsistencia de nombre de campo `tiempoMin` vs `minutos`

- **Hora aproximada**: 2026-10-21 ~19:32 -03:00 (durante la ejecución del
  harness de las 8 funciones cliente)
- **Clasificación**: error propio (naming inconsistente entre módulos)
- **Cómo se detectó**: `app/scripts/harness_funciones_cliente.mjs` corrió
  `chatExportar({formato:'markdown'})` con el estado simulado en
  `minutos=65`, pero el markdown exportado decía
  `- Tiempo transcurrido: 0 min`. Se revisó `generarMarkdownConversacion`
  (`motores/exportar.js`), `ensamblarPromptSistema` (`ia/contexto.js`) y
  `generarRespuestaFallback` (`ia/respuestaFallback.js`): los tres leen
  `estadisticas.minutos`, pero `api_cliente/simEstado.js` guardaba el
  campo como `tiempoMin`.
- **Corrección**: se renombró el campo a `minutos` en `simEstado.js` y en
  todos sus consumidores (`ModuloJuego3D.jsx`, `ControlPanel.jsx`,
  `chatGuardarEstrategia.js`, `analisisEstadisticas.js`,
  `simulacionControl.js`, el harness). Se volvió a correr el harness: el
  markdown exportado ahora dice correctamente `- Tiempo transcurrido: 65
  min` (`ejercicio/salidas/funciones_cliente_salida.json`).
- **Reintentos**: 1 (edición + re-ejecución del harness).
- **Nota**: el campo interno del grid CA (`grid.tiempoMin` en
  `ca_propagacion.js`/`kitral_worker.js`/`escena3D.js`) es un concepto
  distinto (el reloj de la simulación celular) y se dejó con ese nombre
  a propósito; no es el mismo bug.

## 5. Infraestructura (no es un error propio): Overpass API no respondió en la prueba de red inicial

- **Hora aproximada**: 2026-10-21 ~18:50 -03:00 (antes de empezar a
  escribir código, prueba de conectividad previa)
- **Clasificación**: infraestructura
- **Qué pasó**: `curl -m 8 https://overpass-api.de/api/status` devolvió
  código `000` (sin respuesta) mientras que Open-Meteo, Terrarium (S3) y
  el registro de npm sí respondieron 200 en la misma prueba. Esto
  confirmó empíricamente -- no solo por lo que dice el FAQ del documento
  fuente -- que `cache_osm.js` necesita un fallback real y no solo
  teórico. Se implementó `escenarioOSMSintetico()` como fallback
  obligatorio desde el principio, con manejo de `AbortController` +
  timeout también en `cargarCiudad`.
- **Reintento**: ninguno (no se insistió contra Overpass; se construyó
  directamente con fallback, siguiendo el patrón ya aprendido del punto 3).

## 6. Hallazgo de comportamiento, no un bug corregido: el parseador de intenciones dispara comandos con frases interrogativas

- **Hora aproximada**: 2026-10-21 ~19:34 -03:00 (al generar
  `ejercicio/salidas/caso-7.md`)
- **Clasificación**: limitación conocida, documentada, NO corregida en
  este ejercicio (se decidió no ampliar el alcance del parser más allá de
  lo pedido)
- **Qué pasó**: en el caso de uso 7 (multi-turno), la pregunta "¿Y
  retardante por tierra?" disparó el comando `aplicar_retardante` porque
  `parseIntencion` es puramente por palabra clave (`/\bretardante\b/i`) y
  no distingue una pregunta de una orden. Es el comportamiento esperado
  del diseño simple pedido por el documento fuente (Sección 7.2:
  detección por palabra clave), pero vale la pena dejarlo explícito como
  limitación real observada, no inventada. Ver
  `ejercicio/no_comprobado` / `supuestos` en `metadatos.json`.

---

## Resumen

| # | Tipo | Severidad | Corregido |
|---|------|-----------|-----------|
| 1 | Error propio (regex) | Baja (1 test) | Sí |
| 2 | Verificación (mutación deliberada) | N/A | N/A |
| 3 | Error propio + infraestructura | Alta (colgaba toda la app) | Sí |
| 4 | Error propio (naming) | Media (dato incorrecto en export) | Sí |
| 5 | Infraestructura | Baja (ya se esperaba fallback) | N/A (fallback ya contemplado) |
| 6 | Limitación de diseño | Baja | No (documentada, fuera de alcance) |

No hubo errores de permisos, de credenciales, ni pérdida de trabajo. No
se usó `--no-verify` ni se saltó ningún hook. No hubo necesidad de
reintentos de red automáticos más allá de los descritos arriba (los
timeouts agregados son defensivos, para el futuro, no para "pasar" esta
verificación puntual).
