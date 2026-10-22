# Caso 6: Análisis de Amenaza

Generado: 2026-10-22T09:51:30.325Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+170 min, 15.04 ha, ROS 9.79 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

Riesgo para Puerto Montt

## 🤖 IA

**Puerto Montt**
Distancia: 20.9 km (línea recta, rumbo 253°)
ROS en esa dirección: 0.3 m/min
ETA actual: 1049.7 horas (BAJO RIESGO)

Condiciones que cambiarían:
- Viento rota a 73° (directo): ETA 35.5 h (MEDIO)
- ROS 3×: ETA 349.9 h (ALTO)
- Focos secundarios (pavesas): ETA 3–4 h (CRÍTICO)

Recomendación:
- Monitorear cada hora
- Preparar planes de evacuación (no ejecutar aún)
- Alerta si HR <5% o viento >30 km/h

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 92,
  "latencia_s": 0.001,
  "fuente": "plantillas",
  "comando": "analisis_amenaza",
  "resultado": null
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN SITIO, H-01 EN SITIO
- Acciones registradas: 5
- Retardantes activos: 1
- Pausada: false
