# Glosario

El código y la documentación mezclan español e inglés. Los nombres que ve el usuario están en español, y los nombres internos (funciones, campos de la API, columnas de la base de datos) están en inglés. Esta tabla relaciona los términos de uso frecuente.

## Términos del negocio y del sistema

| Español | Inglés (en el código) | Significado |
|---|---|---|
| Sucursal | `branch` | Una sede de Candray. Cada una tiene su horario, su color y, si corresponde, su mostrador de óptica. |
| Sucursal predeterminada | `default_branch` | La sucursal que se activa al iniciar sesión cuando el usuario trabaja en varias. |
| Sucursal activa | `activeBranch` | La sucursal en la que la persona está trabajando en este momento. Se envía al servidor en cada petición. |
| Mostrador de óptica | `optical_counter` | El área de venta de lentes dentro de una sucursal. |
| Itinerante | | Médico que atiende en más de una sucursal. |
| Rol | `role` | El puesto de una persona en el sistema: `admin`, `doctor`, `recepcionista`, `encargado_venta` o `directivo`. |
| Capacidad | `capability` | Un permiso concreto, como `users_manage` (administrar usuarios). Cada rol tiene una lista de capacidades. |
| Perfil de permisos | `PERFIL_PERMISOS` | Elige entre `demostracion` (el administrador puede todo) y `estricto` (el administrador no accede a datos clínicos). |
| Bitácora de auditoría | `audit_log` | El registro de quién hizo qué y cuándo. Solo se agrega información; no se edita ni se borra. |
| Bloqueo de cuenta | `lockout` | La cuenta deja de aceptar contraseñas durante quince minutos después de cinco intentos fallidos. |
| Incremento | | Cada etapa de construcción del sistema. El Incremento 0 es la base: acceso, usuarios, sucursales y auditoría. |
| Mockup | | Prototipo funcional con datos ficticios, hecho para demostrar el sistema. |

## Términos técnicos

| Español | Inglés | Significado |
|---|---|---|
| Migración | `migration` | Archivo SQL que crea o modifica tablas. Se aplican en orden y cada una se registra para no repetirse. |
| Semilla | `seed` | Datos iniciales que se insertan en una base vacía, como los usuarios de demostración. |
| Token | `token` | Texto firmado que el servidor entrega al iniciar sesión y que el navegador envía en cada petición para identificarse. |
| Intermediario | `middleware` | Función que se ejecuta antes de la ruta, por ejemplo para comprobar que hay sesión o que se tiene un permiso. |
| Esquema | `schema` | Descripción de la forma que deben tener los datos de entrada (se escribe con Zod). |
| Ruta | `route` | Una dirección de la API junto con la función que la atiende. En el frontend, una pantalla con su dirección en el navegador. |
| Gancho | `hook` | Función de React que empieza con `use` y comparte lógica entre componentes, como `useCarga`. |
| Ventana | `modal` | Cuadro que se abre sobre la pantalla y bloquea lo demás hasta cerrarse. |
| Token de diseño | `design token` | Valor con nombre (un color, una tipografía) definido en `index.css` que se usa en lugar de valores sueltos. |
| Falla cerrado | `fail closed` | Principio de seguridad: ante la duda se niega el acceso, en lugar de permitirlo. |
| Transacción | `transaction` | Grupo de cambios en la base de datos que se aplican todos o ninguno. |
| Paginación | `pagination` | Mostrar una lista larga en partes, por ejemplo 25 registros por página. |

## Carpetas del código

| Carpeta | Equivale a |
|---|---|
| `modelos` | models: el SQL |
| `servicios` | services: reglas del negocio (en el servidor) o llamadas a la API (en la interfaz) |
| `controladores` | controllers: reciben la petición y responden |
| `rutas` | routes |
| `esquemas` | schemas: validación de datos de entrada |
| `intermediarios` | middlewares |
| `utilidades` | utils: funciones de apoyo |
| `ganchos` | hooks |
| `contexto` | context: estado compartido, como la sesión |
| `navegacion` | navigation: el mapa de pantallas |
| `componentes` | components |
| `paginas` | pages: una carpeta por pantalla |
| `pruebas` | tests |
| `semillas` | seeds |
| `migraciones` | migrations |
