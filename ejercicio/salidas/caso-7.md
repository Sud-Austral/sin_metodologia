# Caso 7: Modo Conversacional — Multi-turn

Generado: 2026-10-22T10:03:43.896Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+180 min, 16.39 ha, ROS 12.01 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

¿Hay alternativa sin helicóptero?

## 🤖 IA

Plan B — Mecanización + Línea Manual
- Excavadora E-5 + Brigada R-22 → línea 15 m ancho
- Duración: 45 min (rápido, arriesgado)
- Riesgo: brigada muy expuesta (llama 3.0 m < línea 15 m)
Veredicto: ⚠️ NO RECOMENDADO sin retardante.

Alternativa: ¿retardante por tierra?

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 60,
  "latencia_s": 0.001,
  "fuente": "plantillas",
  "comando": "alternativa",
  "resultado": null
}
```

</details>

## 👤 Despachador

¿Y retardante por tierra?

## 🤖 IA

✅ VIABLE — Retardante por tierra
- Camión cisterna C-1: 5.000 L agua + gel
- Motobombas M-1: 3 unidades, 400 L/min
- Setup: 5 minutos tras llegada (ETA 6 min)
- Efecto: ROS ↓ 20–25 % (radio 300 m, 2 h)
Combinado con brigada R-22: mejor margen de seguridad.

Di "Ejecutar Plan C" para activarlo (retardante terrestre + brigada manual).

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 79,
  "latencia_s": 0.001,
  "fuente": "plantillas",
  "comando": "alternativa",
  "resultado": null
}
```

</details>

## 👤 Despachador

Ejecutar Plan C

## 🤖 IA

✅ Plan C activado (retardante terrestre + brigada manual)
Seguimiento:
- Camión cisterna C-1 llega en T+8
- Motobombas (3 u.) llega en T+8
- Brigada R-22 llega en T+1

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 39,
  "latencia_s": 0.001,
  "fuente": "plantillas",
  "comando": "ejecutar_plan",
  "resultado": [
    {
      "recurso_id": "C-1",
      "eta_min": 8
    },
    {
      "recurso_id": "M-1",
      "eta_min": 8
    },
    {
      "recurso_id": "R-22",
      "eta_min": 1
    }
  ]
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN TRÁNSITO ETA 1, H-01 EN SITIO, C-1 EN TRÁNSITO ETA 8, M-1 EN TRÁNSITO ETA 8
- Acciones registradas: 9
- Retardantes activos: 1
- Pausada: false
