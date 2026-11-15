# =============================================================================
# instalar_windows.ps1
# Que hace:     deja el proyecto listo para usarse en Windows (sin WSL): crea el
#               usuario y las bases de datos en PostgreSQL, escribe backend\.env,
#               instala las dependencias y carga los datos de demostracion.
# Uso:          desde PowerShell, en la carpeta del proyecto:
#                 powershell -ExecutionPolicy Bypass -File scripts\instalar_windows.ps1
# Requiere:     Node.js 22 o superior y PostgreSQL 16 o superior ya instalados
#               (docs\instalacion.md explica como instalarlos).
#
# El archivo no lleva acentos a proposito: PowerShell 5 lee mal los acentos si
# el archivo no esta guardado con un formato especial.
#
# Se puede ejecutar mas de una vez: si backend\.env ya existe no se toca, y las
# bases se crean solo si no existen.
# =============================================================================
$ErrorActionPreference = 'Stop'

$Raiz = Split-Path -Parent $PSScriptRoot      # la carpeta que contiene a scripts\
$UsuarioBd = 'candray_user'
$BdDemo = 'candray_mockup'                    # la que usa el sistema
$BdPruebas = 'candray_test'                   # la que usan las pruebas del backend
$NodeMinimo = 22

function Paso($texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Fallar($texto) { Write-Host "ERROR: $texto" -ForegroundColor Red; exit 1 }

# Revisa el resultado del ultimo programa externo (PowerShell no lo hace solo).
function Verificar($texto) { if ($LASTEXITCODE -ne 0) { Fallar $texto } }

# Genera texto aleatorio en hexadecimal (letras a-f y numeros): $bytes bytes = el doble de caracteres.
function NuevoSecreto($bytes) {
    $datos = New-Object byte[] $bytes
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $generador.GetBytes($datos)
    return (($datos | ForEach-Object { $_.ToString('x2') }) -join '')
}

if (-not ((Test-Path "$Raiz\backend") -and (Test-Path "$Raiz\frontend"))) {
    Fallar 'no se encontraron las carpetas backend y frontend junto a scripts.'
}

# -----------------------------------------------------------------------------
Paso "1/5 Revisando Node.js $NodeMinimo o superior"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fallar 'Node.js no esta instalado. Instalelo (docs\instalacion.md) y abra una PowerShell nueva.' }
$versionNode = [int]((& node -v).TrimStart('v').Split('.')[0])   # "v22.11.0" -> 22
if ($versionNode -lt $NodeMinimo) { Fallar "Node.js $versionNode es muy antiguo; se necesita $NodeMinimo o superior." }
Write-Host "Node.js $(& node -v), npm $(& npm.cmd -v)"

# -----------------------------------------------------------------------------
Paso '2/5 Buscando PostgreSQL'
$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($psql) {
    $psqlRuta = $psql.Source
} else {
    # El instalador de PostgreSQL no siempre agrega psql al PATH: se busca en su carpeta normal.
    $candidato = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $candidato) { Fallar 'No se encontro psql. Instale PostgreSQL (docs\instalacion.md).' }
    $psqlRuta = $candidato.FullName
}
Write-Host "psql: $psqlRuta"

# La contrasena del administrador de PostgreSQL (la que se escribio al instalarlo).
# Solo se guarda en memoria mientras corre este script.
$segura = Read-Host 'Contrasena del usuario "postgres" de PostgreSQL' -AsSecureString
$env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))

# Ejecuta una instruccion SQL como administrador y devuelve el texto de salida.
function Sql($instruccion) {
    $salida = & $psqlRuta -h localhost -U postgres -v ON_ERROR_STOP=1 -tA -c $instruccion
    Verificar 'PostgreSQL rechazo la instruccion. Revise que el servicio este iniciado y que la contrasena sea correcta.'
    return ($salida -join '').Trim()
}

try {
    # -------------------------------------------------------------------------
    Paso '3/5 Usuario y bases de datos'
    $envArchivo = "$Raiz\backend\.env"
    if (Test-Path $envArchivo) {
        Write-Host 'backend\.env ya existe: se conserva. Se usa la contrasena que ya tiene.'
        $linea = Select-String -Path $envArchivo -Pattern '^DB_PASSWORD=(.+)$' | Select-Object -First 1
        if (-not $linea) { Fallar 'backend\.env no tiene DB_PASSWORD. Completelo o borrelo para generarlo de nuevo.' }
        $claveBd = $linea.Matches[0].Groups[1].Value.Trim()
    } else {
        $claveBd = NuevoSecreto 16
    }

    if ((Sql "SELECT 1 FROM pg_roles WHERE rolname='$UsuarioBd'") -eq '1') {
        Sql "ALTER ROLE $UsuarioBd LOGIN PASSWORD '$claveBd'" | Out-Null
        Write-Host "Usuario ${UsuarioBd}: ya existia, contrasena actualizada."
    } else {
        Sql "CREATE ROLE $UsuarioBd LOGIN PASSWORD '$claveBd'" | Out-Null
        Write-Host "Usuario ${UsuarioBd}: creado."
    }
    foreach ($base in @($BdDemo, $BdPruebas)) {
        if ((Sql "SELECT 1 FROM pg_database WHERE datname='$base'") -eq '1') {
            Write-Host "Base ${base}: ya existia."
        } else {
            Sql "CREATE DATABASE $base OWNER $UsuarioBd" | Out-Null
            Write-Host "Base ${base}: creada."
        }
    }

    # -------------------------------------------------------------------------
    Paso '4/5 Archivo backend\.env'
    if (Test-Path $envArchivo) {
        Write-Host 'Se conserva el existente.'
    } else {
        $ejemplo = "$Raiz\backend\.env.example"
        if (-not (Test-Path $ejemplo)) { Fallar 'falta backend\.env.example.' }
        $firma = NuevoSecreto 32   # firma de las sesiones: 64 caracteres aleatorios
        $texto = [System.IO.File]::ReadAllText($ejemplo)
        $texto = $texto -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$claveBd"
        $texto = $texto -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$firma"
        # UTF-8 sin marca (BOM): con marca, el primer nombre del archivo se leeria mal.
        [System.IO.File]::WriteAllText($envArchivo, $texto, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host 'Creado backend\.env con una contrasena y una firma generadas al azar.'
    }
} finally {
    # Ya no hace falta la contrasena del administrador: se borra de la memoria del proceso.
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# -----------------------------------------------------------------------------
Paso '5/5 Dependencias y datos de demostracion'
Push-Location "$Raiz\backend"
try {
    & npm.cmd install; Verificar 'fallo npm install en backend.'
    Set-Location "$Raiz\frontend"
    & npm.cmd install; Verificar 'fallo npm install en frontend.'
    Set-Location "$Raiz\backend"
    & npm.cmd run reiniciar_demo; Verificar 'fallo npm run reiniciar_demo.'
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Listo. Para usar el sistema abra DOS ventanas de PowerShell:'
Write-Host "  Ventana 1:  cd $Raiz\backend ; npm run dev"
Write-Host "  Ventana 2:  cd $Raiz\frontend ; npm run dev"
Write-Host 'Luego abra http://localhost:5173 en el navegador.'
Write-Host 'Usuarios y contrasena de demostracion: ver LEEME.md.'
