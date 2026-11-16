# 010 — Revisión de seguridad (Incremento 4)

Estado: aceptada (Incremento 4)

## Qué se revisó y cómo
Se probó el sistema como lo haría quien intenta saltarse las reglas, siempre por la API real y con pruebas automáticas que se conservan en `backend/pruebas/seguridad/`. Cada prueba se comprobó rompiendo a propósito la regla que protege, para asegurar que falla cuando debe.

| Archivo de prueba | Qué comprueba |
|---|---|
| `permisosPorRuta` | Para cada ruta, cada rol y cada perfil de permisos: quien no debe entrar recibe exactamente 403, y quien debe entrar no recibe 401 ni un 500. Descubre las rutas recorriendo el servidor, así que una ruta nueva sin clasificar hace fallar la prueba. También cubre tokens falsos, vencidos o de otro algoritmo, usuarios desactivados y cambios de rol o de sucursal, que deben surtir efecto al instante. |
| `coberturaAuditoria` | Que cada acción que cambia datos (o que lee o niega acceso a datos sensibles) deje exactamente una entrada en la bitácora, con quién la hizo y la sucursal, y que la bitácora nunca guarde contraseñas. |
| `ataquesComunes` | Inyección SQL, asignación masiva de campos, entradas raras, secretos en las respuestas, el inicio de sesión que no revela qué correos existen, cabeceras de seguridad y CORS, el límite de intentos, el acceso a datos de otros adivinando identificadores y los abusos de paginación. |
| `sesiones` | El cierre de sesiones al restablecer una contraseña. |

## Hallazgos corregidos
1. **Un texto con el carácter NUL, demasiado largo o una fecha inválida producía un error 500.** La base de datos lo rechazaba y la API no lo traducía. Ahora responde 400 con un mensaje claro (`intermediarios/errores.ts`, códigos de PostgreSQL 22021, 22001, 22007 y 22008).
2. **Restablecer una contraseña no cerraba las sesiones abiertas.** Un token robado seguía sirviendo hasta 8 horas después, aunque el administrador cambiara la clave. Ahora la tabla `users` guarda `sessions_revoked_at` (migración 11), el token lleva su hora de emisión (`iat`) y `authenticate` rechaza todo token emitido antes de ese momento. Se compara por segundos completos, así que el inicio de sesión que ocurre justo después del restablecimiento sí vale. La respuesta de la API nunca incluye ese campo.

## Lo que ya estaba bien (y ahora está probado)
- El rol y la sucursal se leen de la base de datos en cada petición, no del token: un token con un rol inventado no sirve de nada.
- Las rutas fallan cerradas: sin sesión, 401; sin permiso, 403; sin acceso a una sucursal, 403.
- Pedir el registro de otra sucursal o de otro médico responde 404, igual que si no existiera.
- La bitácora solo admite agregar (permisos y disparador de la base de datos).
- Los errores no revelan detalles internos, y el inicio de sesión responde igual si el correo no existe.

## Riesgos aceptados para el prototipo
- **El token dura 8 horas, sin renovación ni cierre de sesión en el servidor.** Aceptable para una demostración; el caso que más importaba (una cuenta comprometida) queda cubierto con el hallazgo 2.
- **Dependencias con avisos de `npm audit`:** ver la decisión 001. Se vuelve a revisar al cerrar el proyecto.
- **Los límites de intentos viven en la memoria del servidor.** Con un solo servidor funcionan; con varios habría que moverlos a una base compartida.

## Una lección de las pruebas
Las pruebas del servidor corren en paralelo sobre la misma base de datos de prueba. Una prueba que compare "cuántas filas hay antes y después" falla cuando otro archivo inserta datos en ese instante, y esto solo ocurre en computadores con muchos núcleos. Las pruebas deben comprobar lo que su regla protege (por ejemplo, que no se borre nada), no un conteo global exacto.
