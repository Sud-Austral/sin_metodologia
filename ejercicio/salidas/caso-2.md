# Caso de uso 2: Control — Desplegar Brigada

_Transcripción REAL obtenida ejecutando app/src/api_cliente/chatConsultar.js contra el estado simulado de abajo. El modelo usado es "fallback-template-local" (respuestas de plantilla) porque este entorno de verificación no tiene WebGPU/GPU real disponible -- ver ejercicio/no_comprobado.md._

Estado al iniciar: minutos=120, hectareas=45.3, ros=8.2, viento=22km/h, humedad=9%, modelo=K2

**Despachador**: Desplegar Brigada R-22 al norte, acceso Los Copihues

**IA** (modelo: fallback-template-local):

✅ Comando ejecutado: desplegar_recurso

- Recurso: R-22
- Dirección: norte
- ETA: 4 min

[respuesta de plantilla local, sin WebGPU disponible]

_Comando detectado y ejecutado: `desplegar_recurso`, parámetros: {"recursoId":"R-22","direccion":"norte","lugar":"Los Copihues"}, resultado: {"recursoId":"R-22","tipo":"brigada","destino":{"lat":-41.234,"lng":-72.445,"nombre":"Los Copihues"},"distanciaKm":1.75,"etaMin":4.2,"estado":"en_transito","etaPrevioCalculo":{"recursoId":"R-22","distanciaKm":1.75,"etaMin":4.2}}_

---

