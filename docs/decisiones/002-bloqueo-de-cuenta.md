# 002 — Bloqueo de cuenta por intentos fallidos

Estado: aceptada (Incremento 0)

## Decisión
- 5 intentos fallidos de contraseña BLOQUEAN LA CUENTA durante 15 minutos
  (`MAX_FAILED_LOGIN_ATTEMPTS`, `ACCOUNT_LOCK_MINUTES` en `negocio.ts`).
- Además hay un limitador por IP que cuenta solo intentos fallidos. Es una
  primera barrera más holgada; la principal es el bloqueo por cuenta.
- Una cuenta bloqueada responde **423** con la cabecera `Retry-After` y
  `retry_after_minutes`. Todos los demás fallos (correo inexistente, contraseña
  mala, cuenta desactivada) responden el mismo **401** "Credenciales incorrectas.".

## Por qué por cuenta y no solo por IP
Todo el personal de una sucursal comparte la misma IP: limitar solo por IP
bloquearía a toda la sucursal por el error de una persona, y un atacante que
cambie de IP no se detendría nunca.

## Detalles que importan
- El conteo es una sola instrucción SQL atómica: 10 intentos simultáneos no
  pueden saltarse el límite.
- El 5.º fallo bloquea y reinicia el contador a 0 (al terminar, 5 intentos nuevos).
- Los intentos mientras la cuenta está bloqueada no se cuentan ni extienden el
  bloqueo, para que nadie pueda mantener bloqueada a otra persona indefinidamente.
- El reloj lo decide la base de datos, no Node.
- Un administrador puede desbloquear antes de tiempo
  (`POST /api/usuarios/:id/desbloquear`); cambiar la contraseña también desbloquea.

## Compromiso aceptado
El 423 revela que la cuenta existe (un 401 genérico no lo haría). Se acepta
porque el personal necesita saber POR QUÉ no puede entrar, y los correos son
internos y conocidos. El 401 de correo inexistente gasta el mismo tiempo de CPU
que uno real (comparación bcrypt falsa) para no revelar correos por tiempos.
