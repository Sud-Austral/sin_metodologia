# Caso 2: Control — Desplegar Brigada

Generado: 2026-10-22T10:03:43.806Z · ejecutado con `node scripts/casos_de_uso.mjs` contra `src/api/cliente.js` (proveedor: plantillas deterministas, sin navegador).

Estado previo: T+130 min, 9.51 ha, ROS 11.75 m/min, viento 22 km/h desde 180°, humedad 9 %.

## 👤 Despachador

Desplegar Brigada R-22 al norte, acceso Los Copihues

## 🤖 IA

✅ Comandos ejecutados:

1. Brigada R-22:
   - Destino: -41.4096, -72.6996
   - Ruta: 6.2 km en línea recta [mostrada en mapa]
   - ETA: 9 minutos
   - Estado: EN TRÁNSITO
   - Misión: línea manual 200 m al llegar

2. Helicóptero H-01:
   - Destino: -41.4096, -72.6996
   - Ruta: 6.2 km en línea recta [mostrada en mapa]
   - ETA: 2 minutos
   - Estado: EN TRÁNSITO
   - Misión: Retardante Phos-Chek (1.200 L), radio 800 m del frente
   - Duración: 4 horas · Efecto esperado: ROS ↓ 33 %

Impacto: en 2 min el grid CA mostrará la línea/zona tratada.

<details><summary>Metadatos del turno</summary>

```json
{
  "status": 200,
  "modelo": "plantillas-deterministas",
  "tokens_utilizados": 122,
  "latencia_s": 0.004,
  "fuente": "plantillas",
  "comando": "desplegar_recurso",
  "resultado": [
    {
      "recurso_id": "R-22",
      "eta_min": 9
    },
    {
      "recurso_id": "H-01",
      "eta_min": 2
    }
  ]
}
```

</details>

## Efecto en el estado

- Recursos: R-22 EN TRÁNSITO ETA 9, H-01 EN TRÁNSITO ETA 2
- Acciones registradas: 2
- Retardantes activos: 0
- Pausada: false
