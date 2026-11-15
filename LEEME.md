# Clínicas y Ópticas Candray: sistema de gestión (mockup)

Este proyecto es un prototipo funcional de un sistema de gestión para las Clínicas y Ópticas Candray. Se desarrolla como trabajo de la Universidad Francisco Gavidia (UFG), Grupo 01, a partir de los requerimientos levantados en las fases de investigación preliminar y de requerimientos. Los usuarios y las contraseñas son inventados; las sucursales usan direcciones, teléfonos y horarios que Candray publica en sus sitios web.

El sistema se construye por incrementos. El Incremento 0 ya está terminado y contiene la base sobre la que se apoyarán las pantallas clínicas y comerciales.

## Qué incluye hoy

El acceso al sistema pide correo y contraseña. Después de cinco intentos fallidos la cuenta se bloquea durante quince minutos. Cada persona tiene un rol (administrador, médico, recepción, encargado de óptica o directivo) y cada rol puede hacer solo lo que le corresponde; el menú muestra únicamente las opciones permitidas. Quien trabaja en varias sucursales puede cambiar de una a otra desde el encabezado, y la interfaz toma el color de la sucursal activa.

El administrador puede crear usuarios, cambiar su rol, asignarles sucursales, desbloquear cuentas y restablecer contraseñas. También puede crear y editar sucursales. El administrador y el directivo pueden consultar la bitácora de auditoría, que registra quién hizo qué y cuándo, con filtros por tipo, acción y fechas.

Las pantallas de recepción, médico y óptica pertenecen al Incremento 1 y todavía no están hechas; esos roles, por ahora, solo ven la página de inicio.

## Tecnologías

El servidor usa Node.js, Express y TypeScript, con PostgreSQL como base de datos. La interfaz usa React, Vite, Tailwind CSS y TypeScript. Las pruebas se escriben con Vitest.

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
| `scripts/` | Comandos de apoyo: aplicar migraciones, reiniciar la demostración e instalar el proyecto. |
| `docs/` | Instalación, convenciones de código, glosario y registro de decisiones. |

## Comandos útiles

| Dónde | Comando | Para qué sirve |
|---|---|---|
| `backend/` | `npm run dev` | Inicia el servidor en el puerto 3000. |
| `backend/` | `npm test` | Ejecuta las pruebas del servidor sobre la base `candray_test`. |
| `backend/` | `npm run migrar` | Aplica las migraciones pendientes. |
| `backend/` | `npm run reiniciar_demo` | Borra la base de demostración y la deja como al inicio. |
| `frontend/` | `npm run dev` | Inicia la interfaz en el puerto 5173. |
| `frontend/` | `npm test` | Ejecuta las pruebas de la interfaz. |
| `frontend/` | `npm run test:zonas` | Repite las pruebas de fechas en otras zonas horarias (solo en WSL, Linux o Mac). |
| `frontend/` | `npm run build` | Revisa los tipos y genera la versión de producción. |

## Documentación

[docs/instalacion.md](docs/instalacion.md) explica la instalación paso a paso. [docs/convenciones.md](docs/convenciones.md) reúne las reglas que sigue el código. [docs/glosario.md](docs/glosario.md) traduce los términos que aparecen mezclados en español e inglés. La carpeta [docs/decisiones/](docs/decisiones/) guarda el razonamiento detrás de cada decisión importante de diseño.
