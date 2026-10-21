# Caso de uso 3: Proyección alternativa

_Transcripción REAL obtenida ejecutando app/src/api_cliente/chatConsultar.js contra el estado simulado de abajo. El modelo usado es "fallback-template-local" (respuestas de plantilla) porque este entorno de verificación no tiene WebGPU/GPU real disponible -- ver ejercicio/no_comprobado.md._

Estado al iniciar: minutos=120, hectareas=45.3, ros=8.2, viento=22km/h, humedad=9%, modelo=K2

**Despachador**: ¿Qué pasa si viento sube a 35 km/h en 30 min?

**IA** (modelo: fallback-template-local):

Escenario alternativo proyectado (viento 35 km/h):

| Métrica | Actual | Proyectado |
|---|---|---|
| ROS (m/min) | 8.2 | 5.4 (-34%) |

Cálculo reproducible: calcularROS(modelo=K2, viento=35km/h, pendiente=0%, humedad=9%) desde app/src/motores/rothermel.js.

[respuesta de plantilla local, sin WebGPU disponible]

_No se detectó ningún comando ejecutable en esta pregunta (se trató como consulta)._

---

