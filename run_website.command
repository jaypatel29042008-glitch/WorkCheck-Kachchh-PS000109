#!/bin/bash
# WorkCheck Kachchh - PS000109 Launcher (macOS / Linux)
cd "$(dirname "$0")"

echo "==============================================================================="
echo "    WorkCheck Kachchh - Occupational Health Monitoring Platform"
echo "                   Problem Statement PS000109 | Kachchh"
echo "==============================================================================="
echo ""
echo "Select how you want to run the platform:"
echo ""
echo " [1] Start WorkCheck Full-Stack Platform (http://127.0.0.1:8090)"
echo " [2] Start Wokwi IoT Bridge Service (http://127.0.0.1:8080)"
echo " [3] Open Static Offline Preview in Browser (index.html)"
echo " [4] Exit"
echo ""
read -r -p "Enter choice (1/2/3/4) [Default: 1]: " choice
choice=${choice:-1}

if [ "$choice" = "1" ]; then
    echo "Starting WorkCheck Platform on http://127.0.0.1:8090 ..."
    cd workcheck_platform
    python3 -m pip install -q -r requirements.txt
    open "http://127.0.0.1:8090" 2>/dev/null || xdg-open "http://127.0.0.1:8090" 2>/dev/null || true
    python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8090
elif [ "$choice" = "2" ]; then
    echo "Starting Wokwi IoT Bridge on http://127.0.0.1:8080 ..."
    cd wokwi_bridge
    python3 -m pip install -q -r ../workcheck_platform/requirements.txt
    open "http://127.0.0.1:8080/docs" 2>/dev/null || xdg-open "http://127.0.0.1:8080/docs" 2>/dev/null || true
    python3 -m uvicorn app:app --host 127.0.0.1 --port 8080
elif [ "$choice" = "3" ]; then
    open "index.html" 2>/dev/null || xdg-open "index.html" 2>/dev/null || true
fi
