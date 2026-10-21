# Caso de uso 7: Modo conversacional multi-turno

_Transcripción REAL obtenida ejecutando app/src/api_cliente/chatConsultar.js contra el estado simulado de abajo. El modelo usado es "fallback-template-local" (respuestas de plantilla) porque este entorno de verificación no tiene WebGPU/GPU real disponible -- ver ejercicio/no_comprobado.md._

Estado al iniciar: minutos=120, hectareas=45.3, ros=8.2, viento=22km/h, humedad=9%, modelo=K2

**Despachador**: ¿Hay alternativa sin helicóptero?

**IA** (modelo: fallback-template-local):

No dispongo de IA generativa en este momento (sin WebGPU), pero el estado medido del grid CA es:
- Tiempo: 120 min
- Superficie: 45.3 ha
- ROS: 8.2 m/min

[respuesta de plantilla local, sin WebGPU disponible]

_No se detectó ningún comando ejecutable en esta pregunta (se trató como consulta)._

---

**Despachador**: ¿Y retardante por tierra?

**IA** (modelo: fallback-template-local):

✅ Comando ejecutado: aplicar_retardante

- Volumen: 1200 L
- Reducción ROS esperada: 35%

[respuesta de plantilla local, sin WebGPU disponible]

_Comando detectado y ejecutado: `aplicar_retardante`, parámetros: {"volumenLitros":1200,"direccion":null}, resultado: {"producto":"Phos-Chek","volumenLitros":1200,"reduccionROSPct":35,"zona":{"row":120,"col":120,"radioCeldas":5},"duracionHoras":4}_

---

**Despachador**: Ejecutar Plan C

**IA** (modelo: fallback-template-local):

No dispongo de IA generativa en este momento (sin WebGPU), pero el estado medido del grid CA es:
- Tiempo: 120 min
- Superficie: 45.3 ha
- ROS: 8.2 m/min

[respuesta de plantilla local, sin WebGPU disponible]

_No se detectó ningún comando ejecutable en esta pregunta (se trató como consulta)._

---

