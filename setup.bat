@echo off
setlocal EnableDelayedExpansion
title BlogReader - Setup
cd /d "%~dp0"

echo.
echo   BlogReader - Setup
echo   ==========================================
echo.

:: ── 1. Check Python ──────────────────────────────────────
echo [INFO]  Checking Python...
python --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=python
    goto python_ok
)
py --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=py
    goto python_ok
)
echo [ERROR] Python not found.
echo         Install from https://python.org (check "Add to PATH" during install)
pause
exit /b 1

:python_ok
for /f "tokens=*" %%v in ('%PYTHON% --version 2^>^&1') do echo [OK]     Found %%v

:: ── 2. Check Node.js ─────────────────────────────────────
echo [INFO]  Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [OK]     Found Node.js %%v

:: ── 3. Python virtual environment ────────────────────────
echo.
echo [INFO]  Setting up Python virtual environment...
if exist "venv\" (
    echo [INFO]  Virtual environment already exists - skipping
) else (
    %PYTHON% -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK]    Created virtual environment at .\venv
)

:: ── 4. Python dependencies ────────────────────────────────
echo.
echo [INFO]  Installing Python dependencies...
venv\Scripts\pip install --upgrade pip -q
if errorlevel 1 goto pip_error
venv\Scripts\pip install -r requirements.txt -q
if errorlevel 1 goto pip_error
echo [OK]    Python dependencies installed
goto pip_done
:pip_error
echo [ERROR] Failed to install Python dependencies.
pause
exit /b 1
:pip_done

:: ── 5. Frontend dependencies ──────────────────────────────
echo.
echo [INFO]  Installing frontend (npm) dependencies...
cd frontend
call npm install --silent
if errorlevel 1 (
    cd ..
    echo [ERROR] Failed to install npm dependencies.
    pause
    exit /b 1
)
cd ..
echo [OK]    Frontend dependencies installed

:: ── 6. Environment file ───────────────────────────────────
echo.
echo [INFO]  Setting up .env file...
if exist ".env" (
    echo [INFO]  .env already exists - skipping
) else (
    copy .env.example .env >nul

    :: Set absolute DATABASE_URL for this machine using PowerShell
    set "DB_PATH=%CD%\blog_notifier.db"
    powershell -NoProfile -Command ^
        "(Get-Content '.env') -replace 'DATABASE_URL=.*', 'DATABASE_URL=%DB_PATH:\=\\%' | Set-Content '.env'"

    echo [OK]    Created .env from .env.example
    echo.
    echo [WARN]  ACTION REQUIRED: Edit .env and add your Telegram credentials:
    echo           BOT_TOKEN  ^<-- get from @BotFather on Telegram
    echo           CHAT_ID    ^<-- your Telegram user ID
)

:: ── 7. Initialise database ───────────────────────────────
echo.
echo [INFO]  Initialising database...
venv\Scripts\python -c "import sys, os; sys.path.insert(0,'backend'); from dotenv import load_dotenv; load_dotenv('.env'); from db import init_db, load_sources_from_yaml; init_db(); load_sources_from_yaml(); print('Database ready.')"
if errorlevel 1 (
    echo [ERROR] Failed to initialise database.
    pause
    exit /b 1
)
echo [OK]    Database created and sources loaded

:: ── Done ─────────────────────────────────────────────────
echo.
echo   ==========================================
echo   Setup complete!
echo   ==========================================
echo.
echo   Next steps:
echo   1. Edit .env  ^-^-  add BOT_TOKEN + CHAT_ID  (optional)
echo   2. Run start.bat  ^-^-  starts both services
echo   3. Open http://localhost:5173 in your browser
echo.
pause
