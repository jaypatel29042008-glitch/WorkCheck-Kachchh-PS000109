@echo off
title WorkCheck Kachchh - SSIP 2026 Launcher
echo ===============================================================================
echo     WorkCheck Kachchh - Occupational Health Monitoring ^& ABHA Platform
echo                    Problem Statement PS000109 ^| SSIP 2026
echo ===============================================================================
echo.
echo Select how you want to run the website:
echo.
echo [1] Launch Standalone Client directly in Default Browser (Zero Install, Instant)
echo [2] Start Full-Stack FastAPI Backend Server (http://localhost:8000)
echo [3] Exit
echo.
set /p choice="Enter option (1/2/3) [Default: 1]: "
if "%choice%"=="" set choice=1

if "%choice%"=="1" (
    echo.
    echo Opening WorkCheck Kachchh in your default browser...
    start "" "index.html"
    exit /b
)

if "%choice%"=="2" (
    echo.
    echo Checking Python environment...
    python --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python is not installed or not in your PATH.
        echo Opening standalone index.html instead...
        start "" "index.html"
        pause
        exit /b
    )
    echo Installing / Verifying dependencies from requirements.txt...
    python -m pip install -r requirements.txt
    echo.
    echo Starting WorkCheck Kachchh FastAPI Uvicorn Server on port 8000...
    echo Open in your browser: http://localhost:8000
    start "" "http://localhost:8000"
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    exit /b
)

if "%choice%"=="3" (
    exit /b
)
