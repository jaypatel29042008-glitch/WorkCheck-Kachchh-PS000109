#!/bin/bash
# Mac: double-click to start. Then open http://localhost:8090
cd "$(dirname "$0")"
python3 -m pip install -q -r requirements.txt
open "http://localhost:8090" 2>/dev/null
python3 -m uvicorn app.main:app --port 8090
