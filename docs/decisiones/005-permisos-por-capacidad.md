# 005 — Permisos por capacidad, decididos siempre en el servidor

Estado: aceptada (Incremento 0)

## Decisión
Los permisos se expresan como capacidades (`users_manage`, `audit_read`, `branches_manage`...) y no como comprobaciones de rol repartidas por el código. Cada ruta del servidor exige una capacidad, y cada router la aplica a todas sus rutas de una vez.

Al iniciar sesión, el servidor entrega al navegador la lista de capacidades de la persona. La interfaz usa esa lista para decidir qué opciones mostrar en el menú y para responder "Sin acceso" cuando alguien escribe a mano la dirección de una pantalla que no le corresponde.

## Por qué
Esconder una opción del menú no protege nada, porque quien conoce la dirección de la API puede llamarla directamente. Por eso el servidor decide siempre, y la interfaz solo oculta lo que no se podría usar.

Entregar las capacidades al iniciar sesión evita que el navegador mantenga su propia copia del mapa de permisos. Una copia así termina desactualizada, y el menú dejaría de coincidir con lo que el servidor permite. De esta forma el menú sigue solo al perfil de permisos activo (ver decisión 004).

## Detalles que importan
- Las rutas fallan cerradas. Una ruta nueva dentro de un router queda protegida por el `can(...)` de ese router, aunque su autor olvide declarar el permiso. En la interfaz, una pantalla sin la capacidad correspondiente muestra "Sin acceso".
- Los nombres de las capacidades se repiten como tipo en `frontend/src/configuracion/capacidades.ts`. Si el servidor agrega una capacidad, hay que agregarla también ahí, y conviene revisar que ambas listas coincidan.
- La interfaz también cierra la sesión cuando el servidor responde 401, que ocurre si la sesión venció o si la cuenta se desactivó mientras estaba abierta.
