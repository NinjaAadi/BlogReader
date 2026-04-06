@echo off
setlocal EnableDelayedExpansion
title BlogReader
cd /d "%~dp0"

set BACKEND_PORT=8000
set FRONTEND_PORT=5173

echo.
echo   ==========================================
echo     BlogReader - Starting...
echo   ==========================================
echo.

:: ── Check 1: Python ───────────────────────────────────────
echo [CHECK] Looking for Python...
python --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=python
    goto python_found
)
py --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=py
    goto python_found
)
echo.
echo   !! Python is not installed or not found !!
echo.
echo   Fix: Go to https://python.org/downloads
echo        Download and install Python 3.11 or newer.
echo        IMPORTANT: During install, check the box that says
echo        "Add Python to PATH"
echo.
pause
exit /b 1
:python_found
for /f "tokens=*" %%v in ('%PYTHON% --version 2^>^&1') do echo [OK]    %%v found

:: ── Check 2: Node.js ──────────────────────────────────────
echo [CHECK] Looking for Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo   !! Node.js is not installed or not found !!
    echo.
    echo   Fix: Go to https://nodejs.org
    echo        Download and install the LTS version.
    echo        Restart this window after installing.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [OK]    Node.js %%v found

:: ── Check 3: Setup was run ────────────────────────────────
echo [CHECK] Checking setup...
if not exist "venv\" (
    echo.
    echo   !! Setup has not been run yet !!
    echo.
    echo   Fix: Double-click setup.bat and wait for it to finish,
    echo        then run start.bat again.
    echo.
    pause
    exit /b 1
)
if not exist "frontend\node_modules\" (
    echo.
    echo   !! Frontend packages are missing !!
    echo.
    echo   Fix: Double-click setup.bat and wait for it to finish,
    echo        then run start.bat again.
    echo.
    pause
    exit /b 1
)
echo [OK]    Setup looks good

:: ── Check 4: .env exists ──────────────────────────────────
if not exist ".env" (
    echo.
    echo   !! .env file is missing !!
    echo.
    echo   Fix: Double-click setup.bat — it will create the .env file.
    echo.
    pause
    exit /b 1
)
echo [OK]    .env file found

echo.
echo   ==========================================
echo   Frontend  ^>^>  http://localhost:%FRONTEND_PORT%
echo   Backend   ^>^>  http://localhost:%BACKEND_PORT%
echo   API Docs  ^>^>  http://localhost:%BACKEND_PORT%/docs
echo   ==========================================
echo.

:: ── Kill existing processes on our ports ─────────────────
echo [INFO]  Clearing ports %BACKEND_PORT% and %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":%BACKEND_PORT%[^0-9]"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":%FRONTEND_PORT%[^0-9]"') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── Start backend ─────────────────────────────────────────
echo [INFO]  Starting backend...
start "BlogReader - Backend" /min cmd /c "venv\Scripts\python backend\main.py > backend.log 2>&1"

:: Wait up to 15s for backend
echo [INFO]  Waiting for backend to be ready (up to 15 seconds)...
set READY=0
for /l %%i in (1,1,15) do (
    if !READY!==0 (
        curl -sf "http://localhost:%BACKEND_PORT%/api/health" >nul 2>&1
        if not errorlevel 1 (
            echo [OK]    Backend is ready
            set READY=1
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)
if !READY!==0 (
    echo.
    echo   !! Backend failed to start !!
    echo.
    echo   What to check:
    echo   1. Open backend.log in this folder to see the error
    echo   2. Make sure no other app is using port %BACKEND_PORT%
    echo   3. Try running setup.bat again
    echo.
    pause
    exit /b 1
)

:: ── Start frontend ────────────────────────────────────────
echo [INFO]  Starting frontend...
start "BlogReader - Frontend" /min cmd /c "cd /d "%~dp0frontend" && npm run dev > ..\frontend.log 2>&1"
timeout /t 3 /nobreak >nul
echo [OK]    Frontend starting up...

:: ── Open browser ──────────────────────────────────────────
echo [INFO]  Opening browser...
start "" "http://localhost:%FRONTEND_PORT%"

:: ── Done ─────────────────────────────────────────────────
echo.
echo   ==========================================
echo   BlogReader is running!
echo   ==========================================
echo.
echo   Open this link in your browser:
echo   http://localhost:%FRONTEND_PORT%
echo.
echo   To STOP: run stop.bat
echo            or close the two minimized windows in the taskbar
echo.
echo   Logs (if something goes wrong):
echo     backend.log   -- backend output
echo     frontend.log  -- frontend output
echo.
pause
