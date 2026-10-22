# Caso 5: Guardado de Decisión

Generado: 2026-10-22T09:51:30.298Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+160 min, 13.45 ha, ROS 9.77 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

Guardá la estrategia actual

## 🤖 IA

✅ Estrategia guardada: "Plan brigada+helicoptero Los Lagos T=160"

Snapshot:
- Brigada R-22 EN SITIO
- Helicóptero H-01 EN SITIO
- Retardantes activos: 1
- Expectativa: ROS ↓ 33 % en zonas tratadas; ⚠️ instalaciones amenazadas

📄 PDF generado: analisis_ia_2026-10-22.pdf
- Resumen ejecutivo
- Estado simulación (T+160, 13.5 ha)
- Conversación completa (9 turnos)
- Análisis estratégico
- Mapa con perímetro + recursos

Descarga: [analisis_ia_2026-10-22.pdf]

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 83,
  "latencia_s": 0.025,
  "fuente": "plantillas",
  "comando": "guardar_estrategia",
  "resultado": {
    "estrategia_id": "6f930ae1-8f9e-4c2c-9017-42919b2ba2f7",
    "nombre": "Plan brigada+helicoptero Los Lagos T=160",
    "turnos": 9,
    "archivo": "analisis_ia_2026-10-22.pdf",
    "pdf_bytes": 15963,
    "snapshot_recursos": [
      {
        "id": "R-22",
        "estado": "EN SITIO",
        "eta_min": 0
      },
      {
        "id": "H-01",
        "estado": "EN SITIO",
        "eta_min": 0
      }
    ]
  }
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN SITIO, H-01 EN SITIO
- Acciones registradas: 5
- Retardantes activos: 1
- Pausada: false
