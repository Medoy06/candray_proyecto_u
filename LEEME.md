# Clínicas y Ópticas Candray: sistema de gestión (mockup)

Este proyecto es un prototipo funcional de un sistema de gestión para las Clínicas y Ópticas Candray. Se desarrolla como trabajo de la Universidad Francisco Gavidia (UFG), Grupo 01, a partir de los requerimientos levantados en las fases de investigación preliminar y de requerimientos. Los usuarios y las contraseñas son inventados; las sucursales usan direcciones, teléfonos y horarios que Candray publica en sus sitios web.

El sistema se construye por incrementos. El Incremento 0 ya está terminado y contiene la base sobre la que se apoyarán las pantallas clínicas y comerciales.

## Qué incluye hoy

El sistema se construyó por incrementos y hoy cubre el recorrido completo de una clínica con óptica, desde el acceso hasta la venta de unos lentes.

**Acceso y administración.** El acceso pide correo y contraseña; después de cinco intentos fallidos la cuenta se bloquea durante quince minutos. Cada persona tiene un rol (administrador, médico, recepción, encargado de óptica o directivo) y cada rol puede hacer solo lo que le corresponde: el menú muestra únicamente las opciones permitidas y el servidor vuelve a comprobarlo en cada petición. Quien trabaja en varias sucursales puede cambiar de una a otra desde el encabezado, y la interfaz toma el color de la sucursal activa. El administrador crea usuarios, cambia roles, asigna sucursales, desbloquea cuentas, restablece contraseñas (lo que además cierra las sesiones abiertas de esa persona), administra sucursales y define los horarios semanales de los médicos.

**Recepción.** Busca y registra pacientes, agenda, reprograma y cancela citas viendo la disponibilidad de los médicos en todas las sucursales, registra el consentimiento del paciente para la óptica y consulta la bandeja de recordatorios de las citas de hoy y mañana (es una simulación: no se envía ningún mensaje).

**Médico.** Ve su agenda, atiende al paciente y escribe su historia clínica (las notas no se editan: se corrigen con una enmienda), emite y reemplaza recetas ópticas, da interconsultas temporales a otros médicos e imprime el expediente. Solo abre el expediente de pacientes que atiende o que le interconsultaron, y cada acceso o negativa queda en la bitácora.

**Óptica.** El encargado de ventas crea órdenes a partir de la receta vigente de un paciente que dio su consentimiento, las avanza (pendiente, en taller, lista, entregada) o las cancela con un motivo. Ve el desglose del IVA de cada orden. Si el paciente revoca el consentimiento, deja de ver las medidas.

**Dirección.** El directivo consulta el panel de indicadores de todas las sucursales (citas, órdenes abiertas y ventas, sin datos de pacientes) y la bitácora de auditoría, que registra quién hizo qué y cuándo.

Existe además una revisión de seguridad con pruebas automáticas que se conservan (ver [docs/decisiones/010-revision-de-seguridad.md](docs/decisiones/010-revision-de-seguridad.md)).

## Tecnologías

El servidor usa Node.js, Express y TypeScript, con PostgreSQL como base de datos. La interfaz usa React, Vite, Tailwind CSS y TypeScript. Las pruebas se escriben con Vitest, y el comando `bash scripts/verificar_todo.sh` ejecuta todas las comprobaciones del proyecto de una vez.

## Cómo ponerlo en marcha

La guía completa está en [docs/instalacion.md](docs/instalacion.md). Incluye la instalación con WSL (Ubuntu dentro de Windows) y la instalación directa en Windows, cada una con su script automático. En WSL basta con esto:

```
git clone https://github.com/Medoy06/candray_proyecto_u.git
cd candray_proyecto_u
bash scripts/instalar_wsl.sh
```

Cuando el script termina, se abren dos terminales. En la primera:

```
cd backend
npm run dev
```

En la segunda:

```
cd frontend
npm run dev
```

La aplicación queda en http://localhost:5173.

## Cuentas de demostración

La contraseña de todas las cuentas es `Candray2026!`. Solo funciona en la base de demostración.

| Rol | Correo | Sucursales |
|---|---|---|
| Administrador | admin@candray.test | Central |
| Médico | dr.mejia@candray.test | Central y Escalón |
| Médico | dra.rivas@candray.test | Central |
| Médico | dr.portillo@candray.test | Escalón |
| Recepción | recepcion.central@candray.test | Central |
| Recepción | recepcion.escalon@candray.test | Escalón |
| Óptica (ventas) | optica.central@candray.test | Central |
| Óptica (ventas) | optica.escalon@candray.test | Escalón |
| Directivo | directivo@candray.test | Todas las activas |

Existe además la sucursal Metrosur, que está inactiva a propósito para mostrar que una sucursal inactiva no aparece en el selector.

## Cómo está organizado

| Carpeta | Contenido |
|---|---|
| `backend/` | El servidor (API). Cada archivo de `src/` pertenece a una capa: modelos, servicios, controladores, rutas, esquemas e intermediarios. Sus pruebas están en `pruebas/`. |
| `frontend/` | La interfaz web. Las páginas están en `src/paginas/`, los componentes reutilizables en `src/componentes/` y las pruebas en `pruebas/`. |
| `base_datos/` | Las migraciones (`migraciones/`) que crean las tablas y la semilla (`semillas/`) con los datos de demostración. |
| `scripts/` | Comandos de apoyo: aplicar migraciones, reiniciar la demostración, instalar el proyecto y verificar que todo funcione. |
| `docs/` | Instalación, convenciones de código, glosario y registro de decisiones. |

## Comandos útiles

| Dónde | Comando | Para qué sirve |
|---|---|---|
| `backend/` | `npm run dev` | Inicia el servidor en el puerto 3000. |
| raíz | `bash scripts/verificar_todo.sh` | Revisa roles, rutas, estructura, tipos, todas las pruebas y la versión de producción. Es lo que se ejecuta antes de cada commit. |
| `backend/` | `npm test` | Ejecuta las pruebas del servidor sobre la base `candray_test`. |
| `backend/` | `npm run migrar` | Aplica las migraciones pendientes. |
| `backend/` | `npm run reiniciar_demo` | Borra la base de demostración y la deja como al inicio. |
| `frontend/` | `npm run dev` | Inicia la interfaz en el puerto 5173. |
| `frontend/` | `npm test` | Ejecuta las pruebas de la interfaz. |
| `frontend/` | `npm run test:zonas` | Repite las pruebas de fechas en otras zonas horarias (solo en WSL, Linux o Mac). |
| `frontend/` | `npm run build` | Revisa los tipos y genera la versión de producción. |

## Documentación

[docs/instalacion.md](docs/instalacion.md) explica la instalación paso a paso. [docs/convenciones.md](docs/convenciones.md) reúne las reglas que sigue el código. [docs/glosario.md](docs/glosario.md) traduce los términos que aparecen mezclados en español e inglés. La carpeta [docs/decisiones/](docs/decisiones/) guarda el razonamiento detrás de cada decisión importante de diseño.
