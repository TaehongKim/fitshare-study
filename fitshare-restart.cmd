@echo off
setlocal
title FitShare server restart
cd /d "%~dp0"

echo Restarting FitShare on the default demo ports 8001 and 8443...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\restart_server.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo FitShare did not restart. Read the error above and check the server logs.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo FitShare is running in the background. This window can be closed.
pause
exit /b 0
