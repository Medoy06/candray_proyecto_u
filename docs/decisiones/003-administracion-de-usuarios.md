# 003 — Reglas de la administración de usuarios y sucursales

Estado: aceptada (Incremento 0)

## Decisiones
1. **Nadie cambia su propio rol ni se desactiva.** Evita que un administrador se
   quite el acceso por accidente. Sí puede cambiarse el nombre.
2. **Siempre queda al menos un administrador activo.** Se garantiza con un
   candado de PostgreSQL (`pg_advisory_xact_lock`) que atiende de uno en uno los
   cambios que podrían quitar administradores; sin él, dos administradores que se
   desactivan a la vez podrían dejar el sistema sin ninguno (verificado con
   peticiones simultáneas).
3. **Los roles de sucursal necesitan sucursal asignada.** Todos menos `admin` y
   `directivo` (que ven todas las activas).
4. **Nada se borra:** los usuarios se desactivan y las sucursales también.
   Desactivar a alguien le quita el acceso al instante, porque `authenticate`
   consulta la base en cada petición.
5. **El correo no se edita** y el **código de sucursal no cambia nunca**: otros
   registros y reportes los usan como referencia.
6. **Cada cambio se audita** con quién lo hizo y solo los campos que cambiaron
   (valor anterior y nuevo). Las contraseñas nunca se guardan en la auditoría.
7. **La bitácora es de solo lectura** en la API; la tabla además está protegida
   con permisos y disparadores (migración 01).

## Arquitectura
modelo (solo SQL) -> servicio (reglas y transacciones) -> controlador (HTTP) ->
ruta (permisos y validación). Las rutas aplican `authenticate` y `can(...)` a
todo el router, de modo que una ruta nueva queda protegida sin acordarse de
agregar el permiso (falla cerrado).

## Pendiente para la limpieza final del incremento
`servicios/gestionUsuarios.ts` importa `seesAllBranches` desde un intermediario;
lo correcto es moverlo a `configuracion/roles.ts`.
