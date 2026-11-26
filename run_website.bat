@echo off
title WorkCheck Kachchh - PS000109 Launcher
echo ===============================================================================
echo     WorkCheck Kachchh - Occupational Health Monitoring Platform
echo                    Problem Statement PS000109 ^| Kachchh
echo ===============================================================================
echo.
echo Select how you want to run the website:
echo.
echo [1] Start WorkCheck Full-Stack Platform (FastAPI + SQLite on http://127.0.0.1:8090)
echo [2] Start Wokwi IoT Bridge Service (FastAPI on http://127.0.0.1:8080)
echo [3] Open Static Offline Preview in Browser (index.html - read-only demo)
echo [4] Exit
echo.
set /p choice="Enter option (1/2/3/4) [Default: 1]: "
if "%choice%"=="" set choice=1

if "%choice%"=="1" (
    echo.
    cd /d "%~dp0workcheck_platform"
    python -m pip install -q -r requirements.txt
    echo Starting WorkCheck Platform on http://127.0.0.1:8090 ...
    start "" "http://127.0.0.1:8090"
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8090
    pause
    exit /b
)

if "%choice%"=="2" (
    echo.
    cd /d "%~dp0wokwi_bridge"
    python -m pip install -q -r ..\workcheck_platform\requirements.txt
    echo Starting Wokwi Bridge on http://127.0.0.1:8080 ...
    start "" "http://127.0.0.1:8080/docs"
    python -m uvicorn app:app --host 127.0.0.1 --port 8080
    pause
    exit /b
)

if "%choice%"=="3" (
    echo.
    echo Opening read-only static preview...
    start "" "%~dp0index.html"
    exit /b
)

if "%choice%"=="4" (
    exit /b
)
