# Caso de uso 5: Guardado de decisión

_Transcripción REAL obtenida ejecutando app/src/api_cliente/chatConsultar.js contra el estado simulado de abajo. El modelo usado es "fallback-template-local" (respuestas de plantilla) porque este entorno de verificación no tiene WebGPU/GPU real disponible -- ver ejercicio/no_comprobado.md._

Estado al iniciar: minutos=120, hectareas=45.3, ros=8.2, viento=22km/h, humedad=9%, modelo=K2

**Despachador**: Guardá la estrategia actual

**IA** (modelo: fallback-template-local):

✅ Estrategia guardada en IndexedDB con snapshot del estado actual (45.3 ha, ROS 8.2 m/min).

[respuesta de plantilla local, sin WebGPU disponible]

_Comando detectado y ejecutado: `guardar_estrategia`, parámetros: {}, resultado: {"ok":true,"nombre":"Plan K2 T=120","id":1,"snapshot":{"minutos":120,"hectareas":45.3,"ros":8.2,"recursos":[{"id":"R-22","estado":"en_transito","destino":{"lat":-41.234,"lng":-72.445,"nombre":"Los Copihues"}},{"id":"H-01","estado":"disponible","destino":null},{"id":"E-5","estado":"disponible","destino":null}],"fecha":"2026-10-21T22:33:14.863Z"}}_

---

