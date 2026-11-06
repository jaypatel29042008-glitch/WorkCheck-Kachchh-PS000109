#!/bin/bash
# WorkCheck Kachchh - SSIP 2026 Launcher (macOS)
cd "$(dirname "$0")"

echo "==============================================================================="
echo "    WorkCheck Kachchh - Occupational Health Monitoring & ABHA Platform"
echo "                   Problem Statement PS000109 | SSIP 2026"
echo "==============================================================================="
echo ""
echo "Select how you want to run the platform:"
echo ""
echo " [1] Launch WorkCheck Platform (Heat + Dust Multi-Hazard Map & Wokwi on port 8090)"
echo " [2] Open Standalone Web Portal in Default Browser (index.html)"
echo " [3] Start FastAPI Server on port 8000"
echo " [4] Exit"
echo ""
read -p "Enter choice (1/2/3/4) [Default: 1]: " choice
choice=${choice:-1}

if [ "$choice" = "1" ]; then
    echo "Starting WorkCheck Platform on http://localhost:8090 ..."
    cd workcheck_platform
    python3 -m pip install -q -r requirements.txt
    open "http://localhost:8090" 2>/dev/null
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8090
fi

if [ "$choice" = "2" ]; then
    echo "Opening index.html in browser..."
    open "index.html"
fi

if [ "$choice" = "3" ]; then
    echo "Starting FastAPI Server on http://localhost:8000 ..."
    python3 -m pip install -q -r requirements.txt
    open "http://localhost:8000" 2>/dev/null
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi

