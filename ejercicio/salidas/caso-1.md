# Caso 1: Lectura Simple

Generado: 2026-10-22T09:51:30.234Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+120 min, 8.25 ha, ROS 9.64 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

¿Cuál es el ROS actual?

## 🤖 IA

El ROS (Rate of Spread) actual es **9.6 m/min**.

El frente avanza 578 metros cada hora. A esta velocidad, llega a Escuela Pucatrihue (~456 m) en aproximadamente 47 min.

Factores:
- Viento 22 km/h desde 180° (a favor)
- Humedad combustible 9% (muy baja)
- Modelo K1 (Pastizal bajo)
- Altura de llama 2.0 m, 8.3 ha quemadas en 120 min

Recomendación: Acelerar despliegue al norte.

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 86,
  "latencia_s": 0.008,
  "fuente": "plantillas",
  "comando": "lectura_ros",
  "resultado": null
}
```

</details>

## Efecto en el estado

- Recursos: ninguno desplegado
- Acciones registradas: 0
- Retardantes activos: 0
- Pausada: false
