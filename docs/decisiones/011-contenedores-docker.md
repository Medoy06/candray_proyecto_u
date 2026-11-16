# 011 — Contenedores con Docker

Estado: aceptada (cierre del Incremento 4)

## Contexto
El sistema necesita Node, PostgreSQL, un archivo `.env` y varios comandos para funcionar. La demostración se presentará en un computador distinto al de desarrollo, y repetir esa instalación allí es lento y puede fallar. Se quería un camino donde lo único que se instale sea Docker.

## Decisión
El sistema corre con Docker Compose en tres servicios:

| Servicio | Imagen | Qué hace |
|---|---|---|
| `base_datos` | PostgreSQL 16 | Guarda los datos en un volumen; crea la base y el usuario la primera vez. |
| `backend` | Node 22 | La API. Al iniciar aplica las migraciones y, si la base está vacía, carga los datos de demostración. |
| `frontend` | nginx | Sirve la interfaz compilada y reenvía `/api` al servidor. |

Solo la interfaz se abre al exterior (puerto 8080). La base de datos y el servidor no se publican en el computador.

## Por qué
- **Un solo origen.** El navegador habla solo con nginx, que sirve la interfaz y reenvía la API. Así no cambia ninguna regla de CORS del servidor, que sigue aceptando únicamente el origen de desarrollo.
- **Usuario sin privilegios de administrador.** `candray_user` se crea como un usuario normal con su propia base, igual que en la instalación manual. Si fuera administrador de PostgreSQL, los permisos que la migración 01 le quita sobre la bitácora de auditoría no tendrían efecto.
- **El servidor corre con `NODE_ENV=production`,** como se usaría de verdad. Reiniciar la demostración borra la base, por eso `reiniciar_demo` se niega a correr en producción; el comando de la guía le pasa `NODE_ENV=development` solo para esa orden. Iniciar el contenedor usa otro comando, `preparar_demo`, que nunca borra nada.
- **Sin configuración obligatoria.** Si no se da `JWT_SECRET`, el servidor genera una al azar en cada inicio, y la contraseña interna de la base tiene un valor por defecto que no queda expuesto fuera de la red de Docker.
- **Imágenes exportables.** `docker/exportar_imagenes.sh` guarda las tres imágenes en un archivo para presentar sin internet. Las imágenes dependen del tipo de procesador en que se construyen.

## Consecuencias
- Detrás de nginx, todas las peticiones llegan al servidor desde la misma dirección y el servidor ignora los encabezados `X-Forwarded-For` (decisión 010). Por eso el tope de inicios de sesión por dirección se sube a 100 en el contenedor; el bloqueo de cuenta tras cinco intentos fallidos sigue igual.
- Al reiniciar el servidor, las sesiones abiertas se cierran, porque la firma de los tokens cambia.
- La conexión no usa HTTPS. Está pensado para correr en el propio computador de la presentación, no para publicarse en internet.
- Las citas de la demostración se crean relativas al día en que se cargó la base. Antes de presentar, se reinicia la demostración.
