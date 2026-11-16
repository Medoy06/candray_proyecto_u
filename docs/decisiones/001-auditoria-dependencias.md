# Decisión 001: auditoría de dependencias

Estado: aceptada. Revisada de nuevo el 16 de noviembre de 2026 (cierre del Incremento 4). La primera revisión fue el 12 de noviembre de 2026.

## Resultado de `npm audit`
| Parte | Resultado |
|---|---|
| Interfaz (`frontend/`) | 0 vulnerabilidades |
| Servidor (`backend/`), todo | 3 (2 moderadas, 1 alta) |
| Servidor, solo lo que se ejecuta en producción (`--omit=dev`) | 1 (la de zod) |

No se aplicó `npm audit fix --force`, porque propone cambios que rompen la compatibilidad.

## minimatch (a través de nodemon): moderada
- nodemon solo se usa para `npm run dev`. No se instala ni se ejecuta con `npm start` en producción.
- Decisión: riesgo aceptado.

## zod 3.25.76: alta (GHSA-mrhx-c7xc-m3w5)
- El aviso describe consumo excesivo de memoria al validar un arreglo muy grande que no tiene tope de longitud: se acumula un error por cada elemento que falla. Las fuentes que consulté mencionan las versiones 4.x hasta la 4.6.5 y el arreglo en la 4.6.6 y la 4.6.7 (octubre de 2026); no encontré una fuente que confirme si la línea 3.x está afectada. `npm audit` la marca porque su regla es "toda versión anterior a 4.6.6".
- No existe un parche para 3.x: la 3.25.76 (julio de 2025) es la última de esa línea. Pasar a Zod 4 cambia la interfaz de los esquemas y exigiría revisar todos los archivos de `esquemas/` justo al cerrar el proyecto.
- Decisión: se mantiene Zod 3. El riesgo concreto es que un cliente envíe un arreglo enorme, y eso está controlado:
  - El proyecto tiene un solo arreglo en sus esquemas (`branch_ids`, en `esquemas/usuarios.ts`) y tiene tope de 50 elementos.
  - El cuerpo de toda petición está limitado a 100 kb (`JSON_BODY_LIMIT`), y una prueba comprueba que un cuerpo mayor responde 413.
  - El límite de peticiones por IP frena los intentos repetidos.
  - Una prueba (`pruebas/seguridad/ataquesComunes.prueba.ts`) envía 2 000 sucursales distintas y exige un 400 por el tope, sin que el servidor caiga. Se comprobó que falla si se quita el tope.
- Si se agrega un arreglo nuevo a un esquema, debe llevar `.max()`.
- Se vuelve a revisar si sale un parche para 3.x, o si el proyecto pasa a producción real.
