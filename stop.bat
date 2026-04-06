@echo off
title BlogReader - Stop
cd /d "%~dp0"

echo.
echo [INFO]  Stopping BlogReader...

:: Kill by port
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":8000[^0-9]"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":5173[^0-9]"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)

:: Also close the named windows
taskkill /FI "WINDOWTITLE eq BlogReader - Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BlogReader - Frontend" /F >nul 2>&1

echo [OK]    Stopped.
echo.
timeout /t 2 /nobreak >nul
