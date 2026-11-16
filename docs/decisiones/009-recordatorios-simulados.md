# 009 — Recordatorios de citas simulados

Estado: aceptada (Incremento 3)

## Decisión
La bandeja de recordatorios es una **simulación**. Muestra las citas agendadas de la sucursal activa, de ahora hasta el final de mañana, con el mensaje que se le enviaría al paciente. El sistema no envía nada y no guarda ningún recordatorio: la lista se calcula con las citas de cada momento. La pantalla lo dice con un aviso fijo para que nadie piense que se enviaron mensajes.

Lo ve recepción (`reminders_read`), solo de la sucursal en la que está trabajando.

## Por qué
Enviar mensajes de verdad exige un proveedor de WhatsApp o SMS, números reales y el consentimiento de contacto de cada paciente. Nada de eso corresponde a un prototipo con datos ficticios. Pero el flujo de trabajo (quién debe recibir aviso, cuándo y con qué texto) sí se puede mostrar completo.

Como no se guarda nada, no hay estados que mantener (enviado, fallido, reintentar) y la bandeja siempre refleja la agenda actual: una cita cancelada o reprogramada sale de la lista sola.

## Detalles que importan
- El mensaje lleva solo lo que el paciente necesita para presentarse: fecha, hora, sucursal y médico. No incluye ningún dato clínico ni el motivo de la consulta.
- La lista tiene un máximo de filas (`REMINDER_LIMITS.maxRows`, en `negocio.ts`) para que una agenda muy llena no vuelva lenta la pantalla.
- Sumar un día a una fecha se hace con texto `AAAA-MM-DD`, sin pasar por la zona horaria del servidor, para que "mañana" sea el mismo en cualquier computador.

## Consecuencias
Si más adelante se envían mensajes reales, el punto de cambio es el servicio de recordatorios: habría que guardar qué se envió y a quién, y pedir el consentimiento de contacto. La interfaz y las reglas de quién entra en la lista se reutilizan.
