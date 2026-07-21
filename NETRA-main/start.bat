@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist "logs" mkdir "logs"
set "START_LOG=logs\startup.log"
set "SERVER_LOG=logs\http-server.log"

> "%START_LOG%" echo [%date% %time%] NETRA startup
call :log [INFO] Project directory: %CD%

where python >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=py"
  ) else (
    call :log [ERROR] Python was not found. Install Python or add it to PATH.
    echo.
    echo Python was not found. See "%START_LOG%".
    pause
    exit /b 1
  )
)

for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 8000; while ($port -le 8010) { try { $tcp = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), $port); $tcp.Start(); $tcp.Stop(); Write-Output $port; exit 0 } catch { $port++ } }; exit 1"') do set "PORT=%%P"

if not defined PORT (
  call :log [ERROR] No free port found in range 8000-8010.
  echo.
  echo No free port found in range 8000-8010. See "%START_LOG%".
  pause
  exit /b 1
)

call :log [INFO] Python command: %PYTHON_CMD%
call :log [INFO] Selected port: %PORT%
call :log [INFO] URL: http://127.0.0.1:%PORT%/
if /I "%NETRA_NO_BROWSER%"=="1" (
  call :log [INFO] Browser auto-open is disabled by NETRA_NO_BROWSER.
) else (
  call :log [INFO] Browser will open automatically.
)

echo.
echo NETRA local server
echo URL: http://127.0.0.1:%PORT%/
echo Startup log: %START_LOG%
echo Server log:  %SERVER_LOG%
echo.
if /I "%NETRA_NO_BROWSER%"=="1" (
  echo Browser auto-open is disabled.
) else (
  echo Browser will open automatically.
)
echo Keep this window open while working with the site.
echo Press Ctrl+C to stop the server.
echo.

if /I "%NETRA_DRY_RUN%"=="1" (
  call :log [INFO] Dry run enabled. Server was not started.
  echo Dry run complete. Server was not started.
  exit /b 0
)

> "%SERVER_LOG%" echo [%date% %time%] Starting NETRA server at http://127.0.0.1:%PORT%/
if /I not "%NETRA_NO_BROWSER%"=="1" (
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://127.0.0.1:%PORT%/'"
)
"%PYTHON_CMD%" -m http.server %PORT% --bind 127.0.0.1 >> "%SERVER_LOG%" 2>&1
set "EXIT_CODE=%errorlevel%"

call :log [WARN] Server stopped with exit code %EXIT_CODE%.
echo.
echo Server stopped with exit code %EXIT_CODE%. See "%SERVER_LOG%".
pause
exit /b %EXIT_CODE%

:log
echo %*
>> "%START_LOG%" echo [%date% %time%] %*
exit /b 0
