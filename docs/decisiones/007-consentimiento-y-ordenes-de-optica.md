# 007 — Consentimiento del paciente y órdenes de óptica

Estado: aceptada (Incremento 3)

## Contexto
La óptica de Candray vende lentes a partir de la receta que escribe un médico. Pero la receta es un dato clínico, y el encargado de ventas no debe tener acceso al expediente. Había que dejarlo ver las medidas que necesita para el taller sin abrirle nada más, y solo si el paciente lo autorizó.

## Decisiones
1. **El consentimiento es un hecho guardado, no un permiso del rol.** Una persona del personal (médico o recepción) registra que el paciente autorizó a la óptica a ver su receta. Es uno por paciente y vale para toda la clínica, no por médico ni por sucursal. No vence solo: dura hasta que alguien lo revoca.
2. **Solo puede haber uno vigente.** Registrar otro mientras hay uno es un error 409. Para renovarlo se revoca el anterior y se registra uno nuevo. Esto lo garantiza un índice único parcial en la base de datos, de modo que dos personas registrándolo a la vez tampoco pueden duplicarlo.
3. **Lo firmado no se reescribe.** Solo se puede revocar (queda escrito cuándo y quién). Nada se borra, y el historial de consentimientos de un paciente se conserva.
4. **La óptica solo puede preguntar si hay uno vigente.** No ve quién lo registró ni la nota.
5. **La receta no se edita: se reemplaza.** Una receta se reemplaza una sola vez, y las órdenes solo se pueden crear sobre la receta vigente, no sobre una que el médico ya corrigió.
6. **La orden no copia las medidas de la receta.** Guarda solo el vínculo. Quien quiera ver las medidas las pide a la API de recetas, que exige el consentimiento en ese momento.
7. **Estados de una orden en un solo sentido:** pendiente, en taller, lista y entregada. Se puede cancelar mientras no esté entregada, y el motivo es obligatorio. La base de datos vuelve a comprobar este mapa, no solo el servidor.
8. **Cambiar de estado es atómico.** La orden se bloquea mientras se decide, para que dos personas no la avancen a la vez.
9. **Los precios incluyen IVA.** El servidor calcula el subtotal sin IVA y el IVA (13 %) y los devuelve con cada orden; la pantalla solo los muestra. El IVA es el resto del total, así que subtotal más IVA suma siempre el total exacto.

## Por qué
La decisión 6 fue la que más pesó. Si la orden copiara las medidas, revocar el consentimiento no serviría de nada: la óptica seguiría teniendo los datos guardados en sus órdenes. Al guardar solo el vínculo, retirar el consentimiento corta el acceso en la siguiente consulta, incluso en órdenes que ya existen. La semilla de demostración incluye ese caso: una orden lista cuyo paciente revocó el consentimiento, donde la óptica ya no ve las medidas.

Ocultar el expediente completo y entregar solo "las medidas vigentes y la nota del taller" aplica el principio de dar a cada rol únicamente lo que necesita.

## Consecuencias
- Cada negativa por falta de consentimiento queda en la bitácora, y se escribe antes de responder.
- Si en el futuro se agrega un rol nuevo que necesite ver recetas, debe pasar por la misma regla de consentimiento.
- Las órdenes de otras sucursales responden 404, igual que si no existieran, para no revelar su existencia.
