# 006 — Reglas de diseño de la interfaz

Estado: aceptada (Incremento 0)

## Decisión
La interfaz sigue siete reglas, que se aplican a todas las pantallas:

1. Los colores, las tipografías y los radios salen de tokens con nombre definidos en `index.css`. No se usan colores sueltos.
2. El tema es solo claro.
3. El color de la sucursal activa es decorativo. Nunca es lo único que transmite un significado.
4. Todo error se muestra con un icono y con texto.
5. Las acciones destructivas usan el botón de peligro y piden confirmación.
6. No se abren ventanas dentro de otras ventanas.
7. Los campos de formulario usan el azul oscuro del título como color de foco, y no el rojo de la marca.

## Por qué
Los tokens permiten cambiar el aspecto de todo el sistema en un solo lugar, y una prueba automática falla si alguien escribe un color suelto. Un solo tema claro reduce el trabajo de diseño y de pruebas, que es lo adecuado para un prototipo.

El color de la sucursal cambia con cada sede, y una persona con dificultad para distinguir colores no podría apoyarse solo en él. Lo mismo ocurre con los errores: el icono y el texto se entienden aunque el color no se perciba.

El botón de peligro con confirmación evita que un clic accidental desactive una cuenta o una sucursal. Las ventanas anidadas complican el manejo del teclado y del foco, por eso se trabaja con una sola ventana a la vez.

El rojo es el color de la marca y también el de los errores. Un campo con borde rojo al recibir el foco se leería como un campo con un error, por eso el foco usa otro color.

## Consecuencias
Un componente nuevo debe usar los tokens existentes. Si hace falta un color nuevo, primero se agrega como token y luego se usa.
