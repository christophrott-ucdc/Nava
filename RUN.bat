@echo off
setlocal EnableExtensions
chcp 65001 >nul

rem NavaPlayer one-click launcher.
rem Double-click: windowed player + local server + control page.
rem Optional: RUN.bat --kiosk | --no-control | --check | --help

cd /d "%~dp0"
title NavaPlayer - A Patra Lume

set "NAVA_WINDOW_MODE=--windowed"
set "NAVA_OPEN_CONTROL=1"
set "NAVA_CHECK_ONLY=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--kiosk" set "NAVA_WINDOW_MODE="
if /I "%~1"=="--no-control" set "NAVA_OPEN_CONTROL=0"
if /I "%~1"=="--check" set "NAVA_CHECK_ONLY=1"
if /I "%~1"=="--help" goto help
if /I not "%~1"=="--kiosk" if /I not "%~1"=="--no-control" if /I not "%~1"=="--check" goto bad_arg
shift
goto parse_args

:args_done
echo.
echo [NAVA] Pregatesc experienta "A Patra Lume"...
echo [NAVA] Folder: %CD%

where node.exe >nul 2>&1
if errorlevel 1 goto missing_node

where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node

node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 22) { console.error('[NAVA] Este necesar Node.js 22 sau mai nou. Detectat: ' + process.versions.node); process.exit(1); }"
if errorlevel 1 goto failed

if not exist "package.json" goto missing_project
if not exist "package-lock.json" goto missing_project

if not exist "config.json" (
  if not exist "config.example.json" goto missing_config_template
  copy /Y "config.example.json" "config.json" >nul
  echo [NAVA] Am creat config.json din config.example.json.
)

if not exist "assets\show\show.json" goto missing_show
if not exist "assets\avatar\avatar-ai.glb" goto missing_avatar
if not exist "media\cinema_4k_h264.mp4" goto missing_video

if not exist "node_modules\.bin\electron.cmd" (
  echo [NAVA] Dependentele lipsesc. Rulez npm ci o singura data...
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 goto failed
)

if "%NAVA_CHECK_ONLY%"=="1" goto run_check

echo [NAVA] Playerul, serverul, consola si tabletele pornesc impreuna.
echo [NAVA] Consola operatorului: http://localhost:4321/control/
echo [NAVA] Tablete:              http://IP-UL-ACESTUI-PC:4321/tablet/
echo [NAVA] Inchide ferestrele playerului pentru oprire.
echo.

if "%NAVA_OPEN_CONTROL%"=="1" (
  start "" /b powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -Command "$url='http://localhost:4321/control/'; $until=(Get-Date).AddSeconds(45); while ((Get-Date) -lt $until) { try { $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($response.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 0" >nul 2>&1
)

if defined NAVA_WINDOW_MODE goto run_windowed
call npm.cmd run start
goto app_finished

:run_windowed
call npm.cmd run start -- %NAVA_WINDOW_MODE%

:app_finished
set "NAVA_EXIT=%ERRORLEVEL%"
if not "%NAVA_EXIT%"=="0" goto failed_with_code
echo.
echo [NAVA] Aplicatia s-a inchis normal.
exit /b 0

:run_check
echo [NAVA] Rulez verificarea completa fara sa pornesc playerul...
call npm.cmd run check
if errorlevel 1 goto failed
echo.
echo [NAVA] Verificarea completa a trecut.
exit /b 0

:help
echo.
echo RUN.bat               Pornire windowed si deschidere consola web
echo RUN.bat --kiosk       Respecta modul kiosk/fullscreen din config.json
echo RUN.bat --no-control  Nu deschide automat consola in browser
echo RUN.bat --check       Verifica proiectul fara sa porneasca playerul
echo RUN.bat --help        Afiseaza acest ajutor
exit /b 0

:bad_arg
echo [NAVA] Argument necunoscut: %~1
echo [NAVA] Foloseste RUN.bat --help
goto failed

:missing_node
echo.
echo [NAVA] EROARE: Node.js 22+ si npm nu sunt disponibile in PATH.
echo [NAVA] Instaleaza Node.js LTS, apoi ruleaza din nou RUN.bat.
goto failed

:missing_project
echo.
echo [NAVA] EROARE: package.json sau package-lock.json lipseste.
echo [NAVA] Ruleaza acest fisier numai din radacina proiectului Nava.
goto failed

:missing_config_template
echo.
echo [NAVA] EROARE: lipseste config.example.json.
goto failed

:missing_show
echo.
echo [NAVA] EROARE: lipseste assets\show\show.json.
goto failed

:missing_avatar
echo.
echo [NAVA] EROARE: lipseste assets\avatar\avatar-ai.glb.
goto failed

:missing_video
echo.
echo [NAVA] EROARE: lipseste media\cinema_4k_h264.mp4.
echo [NAVA] Pune filmul in aceasta cale sau modifica video.path din config.json.
goto failed

:failed_with_code
echo.
echo [NAVA] EROARE: aplicatia s-a oprit cu codul %NAVA_EXIT%.

:failed
echo [NAVA] Consulta ultima eroare de mai sus si folderul runs\ pentru loguri.
pause
exit /b 1
