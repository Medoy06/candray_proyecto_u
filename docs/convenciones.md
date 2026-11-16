# Convenciones del proyecto

Este documento reúne las reglas que se siguieron al escribir el código. Sirve para que cualquier integrante del equipo pueda agregar algo nuevo con el mismo estilo, y para que quien lea el código entienda por qué está organizado así.

## Idioma

Los textos que ve el usuario y todos los comentarios están en español. Los nombres de carpetas y archivos también (`paginas`, `servicios`, `TablaUsuarios.tsx`). Los nombres de funciones, variables y campos de la API van en inglés (`listBranches`, `branch_ids`), porque coinciden con las columnas de la base de datos y con el vocabulario de las librerías. El archivo [glosario.md](glosario.md) traduce los términos que aparecen en ambos idiomas.

## Organización del servidor

Cada archivo de `backend/src/` pertenece a una de estas capas, y cada capa solo habla con la siguiente:

1. El **modelo** contiene el SQL y nada más.
2. El **servicio** contiene las reglas del negocio y abre las transacciones.
3. El **controlador** recibe la petición HTTP y arma la respuesta.
4. La **ruta** declara la dirección, el permiso que exige y el esquema que valida los datos de entrada.

Los **esquemas** (Zod) validan lo que llega, los **intermediarios** (autenticación, permisos, errores) se ejecutan antes o después de las rutas, y las **utilidades** guardan funciones que varias capas necesitan.

## Reglas del servidor

Toda respuesta tiene la misma forma. Cuando todo sale bien, `{ success: true, data: ... }`; cuando hay un error, `{ success: false, message: "..." }` con el código HTTP que corresponde. Los mensajes de error están en español y no revelan datos internos.

Los permisos se declaran por capacidad (por ejemplo `users_manage`), no por rol. Cada router aplica `authenticate` y `can('capacidad')` a todas sus rutas a la vez, así que una ruta nueva queda protegida sin tener que acordarse de agregar el permiso. Si algo falla al decidir, la respuesta es negar el acceso.

Todo lo que llega del cliente se valida con un esquema Zod antes de usarse, y cada array lleva un máximo de elementos. Las consultas SQL usan siempre parámetros (`$1`, `$2`), nunca texto pegado. Los cambios que tocan varias tablas se hacen dentro de una transacción. Los cambios importantes se registran en la bitácora de auditoría con quién los hizo y solo los campos que cambiaron; las contraseñas nunca se guardan ahí.

Nada se borra de forma definitiva: los usuarios y las sucursales se desactivan, de modo que su historial se conserva.

## Organización de la interfaz

El código de `frontend/src/` se reparte así: `paginas/` tiene una carpeta por pantalla, `componentes/` los elementos reutilizables, `ganchos/` la lógica de React que se comparte, `servicios/` las llamadas a la API, `contexto/` la sesión, `navegacion/` y `configuracion/` el mapa de rutas y permisos, `tema/` el color de la sucursal y `utilidades/` funciones puras como el formato de fechas.

Cada pantalla sigue el patrón de **página directora**. La página guarda el estado (qué ventana está abierta, qué filtros hay, qué aviso se muestra) y decide qué hacer. La tabla, los filtros y los formularios son componentes simples que muestran lo que reciben y avisan cuando el usuario hace algo. Así cada pieza se puede entender y probar por separado.

Las reglas que no necesitan pantalla, como validar un formulario o armar lo que se envía al servidor, viven en archivos sin React (por ejemplo `formularioSucursal.ts`). Esos archivos se prueban de forma directa y rápida.

Las listas que se cargan del servidor usan el gancho `useCarga`, que descarta las respuestas viejas, conserva los datos mientras se recarga y quita los datos cuando hay un error, para no mostrar algo antiguo junto a un mensaje de falla. Las tablas usan el componente genérico `Tabla`: cada pantalla define sus columnas y el componente se encarga del marco, los encabezados y el desplazamiento.

## Reglas de diseño

Los colores, las tipografías y los radios de borde salen de los tokens definidos en `index.css`. No se escriben colores sueltos en los componentes; una prueba lo comprueba. El tema es solo claro. El color de la sucursal es decorativo y nunca es lo único que transmite un significado.

Un error siempre se muestra con un icono y con texto, no solo con color. Las acciones destructivas usan el botón de peligro (borde rojo) y piden confirmación antes de ejecutarse. No se abren ventanas dentro de otras ventanas.

Los formularios validan en pantalla para ahorrar un viaje al servidor, pero el servidor siempre tiene la última palabra. Al editar, solo se envían los campos que cambiaron, y un texto vacío se envía como `null`.

Las fechas y horas llegan del servidor como texto, ya en hora de El Salvador. Para mostrarlas se usan las funciones de `formatoFecha.ts` y nunca `new Date("...")`, que reinterpreta el texto según la zona horaria del navegador y puede correr la hora o el día.

## Comentarios

Cada archivo empieza con un encabezado que dice qué hace, de qué depende y quién lo usa. Cada función no obvia lleva una línea que explica qué recibe y qué devuelve. Los comentarios explican el porqué de una decisión; lo que el código ya dice por sí solo no se repite.

Los archivos se mantienen pequeños. Cuando uno empieza a mezclar responsabilidades, se divide.

## Pruebas

Las pruebas viven en las carpetas `pruebas/` de cada parte y terminan en `.prueba.ts` o `.prueba.tsx`. Cada componente, servicio y regla tiene su archivo. Las pruebas de pantalla usan el cliente real de la API con respuestas preparadas, así que ejercitan el mismo camino que usa el navegador.

Al escribir una prueba se comprueba que falle cuando se rompe a propósito la regla que protege. Una prueba que nunca puede fallar no demuestra nada.

Las pruebas del servidor que usan la base de datos trabajan siempre sobre `candray_test` y se niegan a correr contra cualquier otra.

Los archivos de prueba del servidor corren en paralelo sobre esa misma base. Por eso cada prueba crea sus propios datos (con las ayudas de `pruebas/ayudas/`) y no debe depender de conteos globales, como "la tabla tiene exactamente N filas": otro archivo puede insertar datos en ese instante. Las pruebas de seguridad viven en `pruebas/seguridad/` y se describen en la decisión 010.

## Git y scripts

Los mensajes de commit van en español y empiezan con el paso al que pertenecen (por ejemplo, "Paso 5c-4: pantalla de auditoría"). El archivo `backend/.env` nunca se sube al repositorio; solo se sube `backend/.env.example`, sin valores secretos.

Los scripts de instalación y de apoyo se pueden ejecutar más de una vez sin dañar lo que ya existe, y los que borran datos se niegan a correr contra una base que no sea la de demostración.
