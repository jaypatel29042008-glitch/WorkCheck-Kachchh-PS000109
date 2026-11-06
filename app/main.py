"""
================================================================================
WORKCHECK KACHCHH — MASTER DASHBOARD & API SERVER (PS000109)
================================================================================
Lead Architect: Team TM005024, LDRP-ITR Gandhinagar
Client: District Development Office (DDO), Kachchh
================================================================================
"""

import sys
from pathlib import Path

# Add project root to path so all imports work seamlessly
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.api.endpoints import router as api_router

app = FastAPI(
    title="WorkCheck Kachchh (PS000109)",
    description="Digital Occupational Health Monitoring for Industrial Workers & ABDM ABHA Publishing Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for external IoT nodes or cross-origin portals
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static and templates
static_dir = Path(__file__).resolve().parent / "static"
templates_dir = Path(__file__).resolve().parent / "templates"

app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(templates_dir))

# Include API Router
app.include_router(api_router)


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request, view: str = "login"):
    """Serves the unified multi-persona WorkCheck Kachchh interactive dashboard."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "initial_view": view,
            "project_name": "WorkCheck Kachchh",
            "team_id": "TM005024",
            "client": "District Development Office, Kachchh"
        }
    )


@app.get("/worker", response_class=HTMLResponse)
async def serve_worker_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "worker"})


@app.get("/site", response_class=HTMLResponse)
async def serve_site_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "site"})


@app.get("/van", response_class=HTMLResponse)
async def serve_van_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "van"})


@app.get("/district", response_class=HTMLResponse)
async def serve_district_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "district"})


@app.get("/research", response_class=HTMLResponse)
async def serve_research_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "research"})


@app.get("/facilities", response_class=HTMLResponse)
async def serve_facilities_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "facilities"})


@app.get("/datasets", response_class=HTMLResponse)
async def serve_datasets_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "datasets"})


@app.get("/login", response_class=HTMLResponse)
async def serve_login_view(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"initial_view": "login"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
