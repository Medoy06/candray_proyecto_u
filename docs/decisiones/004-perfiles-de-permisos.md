# 004 — Dos perfiles de permisos: demostración y estricto

Estado: aceptada (Incremento 0)

## Decisión
El sistema tiene dos perfiles de permisos, que se eligen con la variable `PERFIL_PERMISOS` del archivo `backend/.env`. La única diferencia entre ellos es lo que puede hacer el administrador. Los permisos de los demás roles son idénticos en los dos perfiles.

En el perfil `demostracion` el administrador tiene todas las capacidades. En el perfil `estricto` conserva solo lo que necesita para administrar (usuarios, sucursales, horarios, consentimientos, auditoría y consultas que no son clínicas) y pierde los expedientes, las recetas, las interconsultas y las acciones que cambian citas, pacientes y órdenes. Si la variable no se define, se usa `demostracion`.

## Por qué
Quien administra los accesos de un sistema clínico no necesita leer los datos de los pacientes. En un uso real eso se cumple con el perfil estricto, que aplica el principio de mínimo privilegio. En la presentación del proyecto, en cambio, conviene que una sola cuenta pueda mostrar todas las pantallas, y para eso existe el perfil de demostración.

La alternativa era crear usuarios de demostración distintos para cada caso. Se descartó porque obliga a cambiar de cuenta durante la presentación y duplica los datos de prueba.

## Detalles que importan
- El mapa de permisos es información pura, sin acceso a variables de entorno ni a la base de datos. Por eso las pruebas pueden comprobar los dos perfiles sin configurar nada.
- El mapa es plano: una lista de roles por capacidad, sin jerarquías ni herencia. Para cambiar un acceso se edita una sola lista.
- El servidor imprime el perfil activo al iniciar, para que no haya dudas de cuál se está usando.

## Compromiso aceptado
Con el perfil de demostración activo, el administrador puede ver datos clínicos. Es correcto para una demostración con datos ficticios, y por eso el perfil estricto debe activarse antes de usar el sistema con datos reales.
