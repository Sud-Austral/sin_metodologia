# Caso 3: Proyección Alternativa

Generado: 2026-10-22T09:51:30.260Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+140 min, 10.8 ha, ROS 9.83 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

¿Qué pasa si viento sube a 35 km/h en 30 min?

## 🤖 IA

🔮 Escenario alternativo proyectado (30 min, viento 35 km/h):

| Métrica | Actual (T+30) | Proyectado |
|---------|--------|-----------|
| ROS | 9.8 m/min | 12.7 m/min (+30%) |
| Altura llama | 2.0 m | 3.7 m (+87%) |
| Superficie | 15.0 ha | 16.3 ha (+8%) |
| ETA Escuela Pucatrihue | T+38 min | T+15 min |

Acción urgente:
- Evacuar Escuela Pucatrihue YA
- Aumentar retardante a 3100 L
- Solicitar helicóptero adicional

¿Quieres continuar en este escenario?

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 107,
  "latencia_s": 0.027,
  "fuente": "plantillas",
  "comando": "proyectar",
  "resultado": {
    "actual": 15.04,
    "proyectado": 16.26
  }
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN SITIO, H-01 EN SITIO
- Acciones registradas: 4
- Retardantes activos: 1
- Pausada: false
