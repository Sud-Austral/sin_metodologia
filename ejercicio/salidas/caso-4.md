# Caso 4: Análisis Estratégico

Generado: 2026-10-22T09:51:30.292Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+150 min, 12.2 ha, ROS 11.85 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

¿Brigada norte o este?

## 🤖 IA

Desplegar al **NORTE** — frente activo.

Análisis:
- Frente principal (norte): ROS 11.9 m/min, amenaza Escuela Pucatrihue (339 m)
- Flanco este: ROS 0.5 m/min, menos crítico
- Cola: ROS 0.3 m/min

Táctica:
1. Brigada R-22 → norte, línea manual 200 m
2. Excavadora E-5 → flanco este (segundo paso)
3. Retardante aéreo H-01 → frente norte (4 horas)

Riesgo: si el retardante demora >10 min, el frente llega a Escuela Pucatrihue en T+29 min.
Recomendación: Evacuación preventiva.

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 101,
  "latencia_s": 0.001,
  "fuente": "plantillas",
  "comando": "analisis_estrategico",
  "resultado": null
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN SITIO, H-01 EN SITIO
- Acciones registradas: 4
- Retardantes activos: 1
- Pausada: false
