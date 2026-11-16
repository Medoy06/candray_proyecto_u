# 008 — Panel de indicadores

Estado: aceptada (Incremento 3)

## Decisión
El panel muestra números, nunca personas. Por cada sucursal a la que la persona tiene acceso, y como total de todas ellas, calcula:
- citas de hoy según su estado (agendadas, completadas, inasistencias y canceladas);
- citas agendadas de mañana hasta dentro de 7 días;
- órdenes de óptica abiertas (pendientes, en taller y listas);
- órdenes entregadas y ventas de los últimos 30 días, con el IVA incluido.

Lo ve la capacidad `dashboard_read`, que tiene el directivo (y el administrador en el perfil de demostración).

## Por qué
El directivo necesita saber cómo va el negocio, pero no necesita saber quiénes son los pacientes. Si la consulta del panel solo devuelve conteos, ningún error en la pantalla o en la API puede filtrar datos de un paciente, porque esos datos nunca salen de la base de datos. Así el directivo ve todas las sucursales sin tener acceso a ningún dato clínico.

El cálculo vive en el servidor y la pantalla solo muestra lo recibido. De ese modo hay una sola fuente de cada número, y se prueba una vez.

## Detalles que importan
- El servicio no recibe una sucursal elegida por el navegador. Usa solo las sucursales que el intermediario de alcance ya comprobó, así que nadie ve números de una sucursal que no le corresponde.
- "Hoy" y "los últimos 30 días" se cuentan con la fecha de El Salvador, no la del servidor.
- Con una lista vacía de sucursales el total son ceros, no un error.
- Las ventas se redondean a centavos al sumar, para no mostrar resultados como 120.00000000000001.
