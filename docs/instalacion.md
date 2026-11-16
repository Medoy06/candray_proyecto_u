# Instalación

Esta guía explica cómo dejar el sistema funcionando en un computador con Windows. Hay dos caminos: usar WSL, que permite correr Ubuntu dentro de Windows, o instalar todo directamente en Windows. Cada camino tiene una instalación automática con un script y una instalación manual paso a paso. Si algo falla con el script, los pasos manuales muestran exactamente lo que el script hace.

Hay además un tercer camino con Docker (Camino C): no instala Node ni PostgreSQL, solo Docker, y es el más sencillo para llevar el sistema a otro computador, por ejemplo el de una presentación.

## Qué se necesita

Se necesita Node.js 22 o superior, PostgreSQL 16 y Git. El proyecto ocupa poco espacio, pero las dependencias de Node pesan unos cientos de megabytes, así que conviene tener al menos 1 GB libre.

## Cuál camino elegir

Se recomienda WSL, porque el servidor y las pruebas se escribieron y se probaron en Ubuntu, y todos los comandos de este proyecto funcionan sin cambios. La instalación directa en Windows también funciona, con una excepción: el comando `npm run test:zonas` usa una sintaxis que solo existe en Linux y Mac, así que en Windows no se puede ejecutar. Las demás pruebas funcionan igual.

---

## Camino A: WSL (Ubuntu en Windows)

### A1. Instalar WSL

Este paso se hace una sola vez por computador. Abra PowerShell como administrador (clic derecho sobre el menú Inicio, "Terminal (administrador)") y escriba:

```
wsl --install
```

Reinicie el computador cuando lo pida. Al volver, se abre una ventana de Ubuntu que pide crear un nombre de usuario y una contraseña de Linux. La contraseña no se ve mientras se escribe; es normal. Recuérdela, porque `sudo` la pedirá más adelante.

### A2. Instalación automática

En la terminal de Ubuntu, descargue el proyecto dentro de su carpeta personal y ejecute el script:

```
cd ~
git clone https://github.com/Medoy06/candray_proyecto_u.git
cd candray_proyecto_u
bash scripts/instalar_wsl.sh
```

Conviene clonar dentro de Ubuntu (la carpeta `~`) y no en `/mnt/c/...`, que es el disco de Windows. Ahí todo funciona mucho más lento y Git puede cambiar los saltos de línea de los scripts, lo que los rompe.

El script instala lo que falte (PostgreSQL y Node.js), crea el usuario y las bases de datos, genera el archivo `backend/.env` con una contraseña y una firma al azar, instala las dependencias y carga los datos de demostración. Pide la contraseña de Linux una vez para usar `sudo`. Se puede ejecutar de nuevo sin problema: lo que ya existe se conserva.

### A3. Instalación manual

Estos son los mismos pasos que hace el script.

1. Instale los programas base.

   ```
   sudo apt update
   sudo apt install -y git curl openssl postgresql postgresql-contrib
   ```

2. Instale Node.js 22. Si ya tiene Node 22 o superior (`node -v` lo muestra), omita este paso.

   ```
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. Inicie PostgreSQL.

   ```
   sudo service postgresql start
   ```

4. Cree el usuario y las dos bases de datos. Reemplace `una_clave_segura` por una contraseña que usted elija y anótela, porque la necesitará en el paso 6. La base `candray_mockup` es la del sistema y `candray_test` la usan las pruebas del servidor.

   ```
   sudo -u postgres psql -c "CREATE ROLE candray_user LOGIN PASSWORD 'una_clave_segura';"
   sudo -u postgres createdb --owner=candray_user candray_mockup
   sudo -u postgres createdb --owner=candray_user candray_test
   ```

5. Descargue el proyecto.

   ```
   cd ~
   git clone https://github.com/Medoy06/candray_proyecto_u.git
   cd candray_proyecto_u
   ```

6. Cree el archivo de configuración del servidor. Primero copie el ejemplo y genere una firma para las sesiones.

   ```
   cp backend/.env.example backend/.env
   openssl rand -hex 32
   ```

   El último comando escribe una cadena de 64 caracteres. Cópiela. Abra el archivo con `nano backend/.env` y complete dos líneas: `DB_PASSWORD=` con la contraseña del paso 4 y `JWT_SECRET=` con la cadena que acaba de generar. Para guardar en nano use Ctrl+O y Enter, y para salir Ctrl+X.

7. Instale las dependencias de las dos partes.

   ```
   cd backend
   npm install
   cd ../frontend
   npm install
   ```

8. Cargue los datos de demostración.

   ```
   cd ../backend
   npm run reiniciar_demo
   ```

### A4. Cada vez que abra Ubuntu

En WSL, PostgreSQL no siempre se inicia solo al abrir la terminal. Antes de levantar el servidor, escriba:

```
sudo service postgresql start
```

---

## Camino B: Windows sin WSL

### B1. Instalar los programas

Node.js se descarga desde https://nodejs.org (elija la versión LTS, que debe ser 22 o superior). Git se descarga desde https://git-scm.com. Si prefiere la línea de comandos, en PowerShell sirven estos dos comandos:

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

PostgreSQL se instala con el instalador gráfico de https://www.postgresql.org/download/windows/ (versión 16 o superior). Durante la instalación el programa pide una contraseña para el usuario `postgres`, que es el administrador de la base de datos. Anótela, porque el script y los pasos manuales la necesitan. El puerto debe quedar en 5432 y los demás componentes pueden quedar como vienen.

Cuando termine de instalar todo, cierre PowerShell y abra una nueva, para que reconozca los programas recién instalados.

### B2. Instalación automática

En PowerShell:

```
cd $HOME
git clone https://github.com/Medoy06/candray_proyecto_u.git
cd candray_proyecto_u
powershell -ExecutionPolicy Bypass -File scripts\instalar_windows.ps1
```

El script pregunta la contraseña del usuario `postgres`, crea el usuario y las bases de datos del proyecto, genera `backend\.env`, instala las dependencias y carga los datos de demostración. Igual que el de WSL, se puede ejecutar de nuevo sin problema.

### B3. Instalación manual

1. Descargue el proyecto.

   ```
   cd $HOME
   git clone https://github.com/Medoy06/candray_proyecto_u.git
   cd candray_proyecto_u
   ```

2. Abra la consola de PostgreSQL. Si `psql` no se reconoce como comando, use la ruta completa; el número `16` cambia según la versión instalada. PowerShell pedirá la contraseña del usuario `postgres`.

   ```
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
   ```

3. Dentro de `psql`, escriba estas tres instrucciones, cada una terminada en punto y coma. Reemplace `una_clave_segura` por la contraseña que elija y anótela. Después escriba `\q` para salir.

   ```
   CREATE ROLE candray_user LOGIN PASSWORD 'una_clave_segura';
   CREATE DATABASE candray_mockup OWNER candray_user;
   CREATE DATABASE candray_test OWNER candray_user;
   ```

4. Cree el archivo de configuración y genere la firma de las sesiones.

   ```
   Copy-Item backend\.env.example backend\.env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copie la cadena de 64 caracteres que aparece. Abra `backend\.env` con `notepad backend\.env` y complete `DB_PASSWORD=` con la contraseña del paso anterior y `JWT_SECRET=` con la cadena generada. Guarde el archivo.

5. Instale las dependencias y cargue los datos de demostración.

   ```
   cd backend
   npm install
   cd ..\frontend
   npm install
   cd ..\backend
   npm run reiniciar_demo
   ```

---

## Camino C: Docker (el más simple para presentar en otro computador)

Con Docker, el sistema completo (base de datos, servidor e interfaz) corre en contenedores y la única instalación necesaria es Docker. No hace falta Node, PostgreSQL ni configurar nada.

### C1. Instalar Docker

En Windows y en Mac se instala Docker Desktop desde https://www.docker.com/products/docker-desktop y se deja abierto (el icono de la ballena debe estar quieto). En Linux se instala Docker Engine con el plugin de Compose. Para comprobarlo:

```
docker --version
docker compose version
```

### C2. Iniciar el sistema desde el código

En la carpeta principal del proyecto:

```
docker compose up -d --build
```

La primera vez descarga las imágenes base y construye el sistema, lo que tarda unos minutos y necesita internet. Cuando termina, abra http://localhost:8080 e inicie sesión con una cuenta de demostración del archivo [LEEME.md](../LEEME.md). Al iniciar, el servidor aplica las migraciones y, si la base está vacía, carga los datos de demostración, así que no hay nada más que preparar.

### C3. Llevarlo a otro computador sin internet

En el computador donde ya funciona, guarde las imágenes en un solo archivo:

```
sh docker/exportar_imagenes.sh
```

Copie `candray-imagenes.tar.gz` y `docker-compose.yml` al otro computador (en una memoria USB, por ejemplo). Allá, con Docker abierto y en la carpeta donde dejó los dos archivos:

```
docker load -i candray-imagenes.tar.gz
docker compose up -d --no-build
```

Las imágenes solo sirven en el mismo tipo de procesador en que se construyeron. Si construyó en un PC Intel/AMD y presenta en un Mac con chip Apple (o al revés), mejor copie todo el proyecto y use el comando de C2 en el computador de destino, con internet.

### C4. Uso diario

| Para | Comando |
|---|---|
| Iniciar (después de la primera vez) | `docker compose up -d` |
| Detener, conservando los datos | `docker compose down` |
| Ver qué está pasando | `docker compose logs -f backend` |
| Dejar la demostración como al inicio (hágalo antes de presentar) | `docker compose exec -e NODE_ENV=development backend npm run reiniciar_demo` |
| Borrar todo, datos incluidos, y empezar de cero | `docker compose down -v` |

Los datos viven en un volumen de Docker y sobreviven a `down`. Las citas de la demostración se crean relativas al día en que se cargó la base: si pasaron días desde la última vez, reinicie la demostración (cuarta fila) antes de presentar, para que la agenda de hoy tenga citas.

Si el puerto 8080 está ocupado, use otro: `PUERTO=9090 docker compose up -d` (en PowerShell: `$env:PUERTO=9090; docker compose up -d`) y abra http://localhost:9090.

---

## Iniciar el sistema

El sistema son dos programas que corren al mismo tiempo, así que se necesitan dos terminales abiertas. En la primera se inicia el servidor:

```
cd backend
npm run dev
```

Debe aparecer el mensaje "API de Candray escuchando en el puerto 3000". En la segunda se inicia la interfaz:

```
cd frontend
npm run dev
```

Abra http://localhost:5173 en el navegador e inicie sesión con una de las cuentas de demostración del archivo [LEEME.md](../LEEME.md). Para detener cualquiera de los dos programas, presione Ctrl+C en su terminal.

## Comprobar que todo funciona

Las pruebas del servidor usan la base `candray_test`. Cada vez que se ejecutan, esa base se borra y se vuelve a crear, y nunca se toca la base `candray_mockup` de la demostración.

```
cd backend
npm test
```

Las pruebas de la interfaz no necesitan base de datos:

```
cd frontend
npm test
```

Si todo está bien, ambas terminan con todas las pruebas en verde.

Para ejecutar todas las comprobaciones del proyecto juntas (roles, rutas, estructura, tipos, pruebas del servidor y de la interfaz y la versión de producción), use desde la carpeta principal del proyecto:

```
bash scripts/verificar_todo.sh
```

Debe terminar con "Resultado: todo pasó". Las pruebas del servidor tardan unos segundos porque revisan todas las rutas con todos los roles.

## Actualizar una instalación existente

Cuando el proyecto recibe cambios que incluyen una migración nueva, la base de datos de demostración debe ponerse al día. Desde `backend/`:

```
npm run migrar
```

Aplica solo las migraciones que faltan y conserva los datos. Si prefiere empezar de cero con los datos de ejemplo, use `npm run reiniciar_demo`. Las pruebas no necesitan este paso: preparan su propia base cada vez.

## Volver la demostración al estado inicial

Después de crear usuarios o sucursales de prueba, el siguiente comando deja la base como estaba al terminar la instalación. Borra todo su contenido, y por seguridad solo funciona con la base `candray_mockup`.

```
cd backend
npm run reiniciar_demo
```

## Problemas frecuentes

**Aparece `ECONNREFUSED` o el servidor no logra conectarse a la base.** PostgreSQL no está iniciado. En WSL se arregla con `sudo service postgresql start`. En Windows, abra la aplicación "Servicios" y revise que el servicio de PostgreSQL esté en ejecución.

**Aparece `password authentication failed for user "candray_user"`.** La contraseña de `backend/.env` no es la que tiene el usuario en PostgreSQL. Si usó el script, vuelva a ejecutarlo: deja al usuario con la contraseña que tenga el archivo `.env`.

**Aparece "la configuración del entorno no es válida".** Falta una variable en `backend/.env` o está mal escrita. El mensaje dice cuál; compare con `backend/.env.example`.

**El script de WSL falla con `$'\r': command not found`.** El archivo tiene saltos de línea de Windows. Pasa cuando el proyecto se clonó con Git de Windows y se ejecuta desde Ubuntu. Clone el proyecto de nuevo dentro de Ubuntu, como indica el paso A2.

**PowerShell dice que la ejecución de scripts está deshabilitada.** Ejecute el script con el comando completo de la sección B2, que incluye `-ExecutionPolicy Bypass`. Ese permiso vale solo para esa ejecución.

**Vite avisa que el puerto 5173 está ocupado.** Hay otro programa usando ese puerto, y Vite escoge el siguiente libre. Use la dirección que muestra en pantalla.

**Aparece `EADDRINUSE` al iniciar el servidor.** Algo más está usando el puerto 3000, a veces otra copia del mismo servidor que quedó abierta. Ciérrela, o cambie `PORT` en `backend/.env` y el destino del proxy en `frontend/vite.config.ts`.

**Una pantalla da error 500 o "tabla no existe" después de actualizar el proyecto.** Falta aplicar una migración nueva: ejecute `npm run migrar` dentro de `backend/`.

**Con Docker, `docker compose up` falla con "Cannot connect to the Docker daemon" o similar.** Docker Desktop no está abierto. Ábralo y espere a que termine de iniciar.

**Con Docker, la página no carga justo después de iniciar.** El servidor tarda unos segundos en preparar la base la primera vez. Revise `docker compose logs backend`: debe terminar con "API de Candray escuchando".

**Con Docker aparece `exec /entrada.sh: no such file or directory`.** El archivo se descargó con saltos de línea de Windows. Las imágenes ya los corrigen al construir, pero si ocurre, ejecute `docker compose build --no-cache`.

**El inicio de sesión responde que la cuenta está bloqueada.** Cinco intentos fallidos bloquean la cuenta quince minutos. Se puede esperar, desbloquearla desde la pantalla de Usuarios con la cuenta de administrador, o ejecutar `npm run reiniciar_demo`.
