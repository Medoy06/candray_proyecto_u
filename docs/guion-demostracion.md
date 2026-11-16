# Guion de la demostración

Este guion recorre el sistema rol por rol en unos 20 minutos. Cada parte dice qué hacer, qué decir y qué debe verse en pantalla. Los datos son ficticios y todas las cuentas usan la contraseña `Candray2026!`.

## Antes de empezar

1. Deje la base de demostración en su estado inicial. Desde `backend/`:

   ```
   npm run reiniciar_demo
   ```

2. Inicie el servidor (`npm run dev` en `backend/`) y la interfaz (`npm run dev` en `frontend/`), y abra http://localhost:5173.
3. Use dos ventanas del navegador (una normal y una privada) para la parte de sesiones cerradas, en el paso 4.
4. Reinicie la demostración si hizo pruebas: el guion cuenta con los datos de ejemplo y con una bitácora vacía.

Dos cosas que conviene saber:

- Las citas de la semilla se crean solo en días hábiles y relativas a hoy. Si reinicia en fin de semana, la agenda de "hoy" estará vacía; reinicie un día hábil antes de presentar.
- La bitácora de auditoría empieza vacía a propósito: se llena con lo que se haga durante la demostración. Por eso la parte de dirección va al final.

## Datos de ejemplo que se usan

| Paciente | Qué tiene | Para qué sirve en la demostración |
|---|---|---|
| María Fernanda Guzmán | Orden pendiente (Central); el médico reemplazó su receta; una nota con enmienda | Receta reemplazada y enmienda |
| Carlos Eduardo Ramírez | Orden en taller (Central), consentimiento vigente | Revocar el consentimiento en vivo |
| Ana Patricia Orellana | Orden entregada, con toda su historia | Historia de una orden |
| José Luis Menjívar | Orden cancelada en Escalón, con su motivo | Otra sucursal y cancelación |
| Gabriela Alexandra Cruz | Orden lista, pero el consentimiento ya fue revocado | La óptica ya no ve las medidas |
| Miguel Ángel Palacios | Interconsulta de la Dra. Rivas al Dr. Portillo | Acceso temporal entre médicos |
| Sandra Elizabeth Pineda | Sin consentimiento ni receta | Caso "sin consentimiento" |

## 1. Recepción (Marta Flores, Central)

Cuenta: `recepcion.central@candray.test`

1. Inicie sesión. **Diga:** el menú solo muestra lo que este rol puede hacer, y el servidor lo vuelve a comprobar en cada petición.
2. Entre a **Citas**. Muestre la agenda de hoy y use **Agendar cita**: al elegir médico y fecha, el sistema ofrece solo las franjas libres y respeta el horario de cada médico. Pruebe con el Dr. Mejía, que es itinerante y reparte la semana entre Central y Escalón.
3. Entre a **Pacientes**, busque a Carlos Eduardo Ramírez y abra su fila: muestra datos de contacto, nada clínico. **Diga:** recepción nunca ve diagnósticos.
4. En **Citas**, abra una cita de hoy y use **Marcar como atendida** (es lo que hace recepción al terminar la consulta; el médico no cambia estados de citas).
5. En **Recordatorios** muestre las citas de hoy y mañana con el mensaje que se enviaría. **Diga:** es una simulación y no se envía nada (decisión 009).
6. En la fila de Carlos use **Consentimiento** y observe que está vigente. **No lo revoque todavía:** se hace en el paso 3, para que se vea el efecto en la óptica.

## 2. Médicos (Dra. Rivas y Dr. Portillo)

Cuentas: `dra.rivas@candray.test` y `dr.portillo@candray.test`

1. Con la Dra. Rivas, abra **Citas** y vea su agenda de hoy. Elija un paciente que tenga cita hoy con ella, ábrale el expediente desde **Pacientes** y use **Nueva nota de consulta**. **Diga:** la nota se escribe sobre una consulta de ese médico, de hoy o pasada, nunca sobre una futura, cancelada o ausencia, y cada consulta tiene una sola nota.
2. En una nota ya escrita use **Enmendar nota**. **Diga:** las notas no se editan; la corrección queda al lado de la original y se ve en el historial. Para verla hecha, abra el expediente de María Fernanda Guzmán.
3. Use **Emitir receta** sobre una nota original. **Diga:** una receta no se modifica, se **Reemplaza**; la orden de óptica solo acepta la vigente.
4. Cierre sesión y entre como el Dr. Portillo. Busque a **Miguel Ángel Palacios**, a quien Portillo nunca atendió: aun así abre su expediente, porque la Dra. Rivas le dio una **interconsulta**. En la sección de interconsultas se ve quién la dio y cuándo vence (14 días).
5. **Acceso negado en vivo.** Vuelva con la Dra. Rivas, abra el expediente de Miguel Ángel Palacios y use **Revocar interconsulta**. Regrese al Dr. Portillo y recargue: ahora recibe "sin acceso". **Diga:** un médico solo abre expedientes de pacientes que atiende o que le interconsultaron, el sistema falla cerrado, y la negativa queda en la bitácora.

## 3. Óptica (Sofía Campos, Central)

Cuenta: `optica.central@candray.test`

1. Entre a **Órdenes de óptica**. Muestre los estados (pendiente, en taller, lista, entregada) y abra la orden de **María Fernanda Guzmán**: lleva la etiqueta "Receta reemplazada". Muestre el desglose: subtotal sin IVA, IVA (13 %) y total.
2. Abra la orden de **Ana Patricia Orellana**: la **Historia de la orden** muestra quién y cuándo cambió cada estado.
3. Use **Nueva orden de óptica** con un paciente que tenga consentimiento y receta. **Diga:** la orden guarda solo el vínculo con la receta, no copia las medidas (decisión 007).
4. Muestre la orden de **Gabriela Alexandra Cruz**: está lista, pero su consentimiento fue revocado, así que la óptica ya no ve las medidas. Intente crear una orden para un paciente sin consentimiento (Sandra Elizabeth Pineda): se niega.
5. **Revocación en vivo.** Cambie a Marta Flores (recepción), abra **Consentimiento** de Carlos Eduardo Ramírez y use **Revocar consentimiento**. Vuelva a Sofía y recargue la orden de Carlos: ya no ve sus medidas. **Diga:** retirar el permiso corta el acceso al instante, incluso en órdenes que ya existían.
6. Cambie a Daniel Alvarado (`optica.escalon@candray.test`): solo ve las órdenes de Escalón. La orden cancelada de José Luis Menjívar y su motivo aparecen aquí; las de Central no existen para él.

## 4. Administración (Ana Martínez)

Cuenta: `admin@candray.test`

1. **Usuarios:** muestre la lista, **Nuevo usuario** y la asignación de sucursales. **Desbloquear cuenta** se ve así: en la ventana privada escriba mal la contraseña de un usuario cinco veces (la cuenta se bloquea 15 minutos) y desbloquéela desde aquí.
2. **Sesiones cerradas.** En la ventana normal inicie sesión como `optica.escalon@candray.test`. Desde el administrador use **Cambiar contraseña** sobre ese usuario. Vuelva a la ventana de la óptica y actualice cualquier pantalla: la sesión se cerró. **Diga:** si una clave se filtra, restablecerla corta también las sesiones abiertas (decisión 010).
3. **Horarios de médicos:** muestre los bloques semanales y cómo el Dr. Mejía se reparte entre sucursales; es lo que usa la agenda para ofrecer franjas.
4. **Sucursales:** muestre que Metrosur está inactiva y por eso no aparece en el selector de sucursal del encabezado.
5. **Diga:** en el perfil `demostracion` el administrador puede todo, para mostrar cada función. En el perfil `estricto` no accede a datos clínicos (decisión 004).

## 5. Dirección (Roberto Quintanilla)

Cuenta: `directivo@candray.test`

1. **Panel de indicadores:** citas de hoy por estado, próximas citas, órdenes abiertas y ventas de los últimos 30 días, por sucursal y en total. **Diga:** son solo números; el directivo ve todas las sucursales sin ver a ningún paciente (decisión 008).
2. **Auditoría:** ahora la bitácora tiene todo lo hecho en la demostración: la nota, la enmienda, el consentimiento revocado, la contraseña restablecida y las negativas de acceso. Filtre por acción o por fecha. **Diga:** solo se agrega, nunca se edita ni se borra.

## Cierre: lo que no se ve pero se probó

Si preguntan por seguridad, estos son los puntos (decisión 010): cada ruta se probó con cada rol y con los dos perfiles de permisos; todo token falso, vencido o de un usuario desactivado se rechaza; el rol se lee de la base de datos en cada petición; cada acción deja una entrada en la bitácora; y se corrigieron dos fallas encontradas en la revisión.

## Si algo sale mal

| Situación | Qué hacer |
|---|---|
| La agenda de hoy está vacía | Es fin de semana. Reinicie la demostración un día hábil. |
| "Cuenta bloqueada" en una cuenta que no debía | Entre como administrador y use **Desbloquear cuenta**, o ejecute `npm run reiniciar_demo`. |
| Error al conectar con la base | En WSL, `sudo service postgresql start`. |
| Los datos quedaron muy cambiados | `npm run reiniciar_demo` deja todo como al inicio. |
