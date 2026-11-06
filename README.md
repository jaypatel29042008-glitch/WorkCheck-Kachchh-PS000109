# WorkCheck Kachchh (PS000109)

[![Live Website](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://jaypatel29042008-glitch.github.io/WorkCheck-Kachchh-PS000109/)
[![SSIP Gujarat](https://img.shields.io/badge/SSIP%20Gujarat-2026-blue?style=for-the-badge)](https://ssipgujarat.in/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-teal?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-orange?style=for-the-badge)](LICENSE)

> **Seva First Innovation Challenge 2026 / SSIP Gujarat**  
> **Problem Statement PS000109**: *Digital Occupational Health Monitoring for Industrial Workers (DDO Kachchh)*  
> **Lead Developer**: Jay Patel ([@jaypatel29042008-glitch](https://github.com/jaypatel29042008-glitch))

---

## 🌐 Live Website & Online Access

Experience the full interactive dashboard live on GitHub Pages with zero installation required:

👉 **[Launch WorkCheck Kachchh Live Web Application](https://jaypatel29042008-glitch.github.io/WorkCheck-Kachchh-PS000109/)**

The application automatically loads high-fidelity pre-seeded telemetry and hazard models on static environments, enabling full interactive exploration of heat stress maps, clinic workflows, worker ABHA lockers, and PDF health card generation directly in your browser.

---

## 📌 Executive Summary & Problem Context

Kachchh is home to over 140,000 industrial and informal workers across salt pans, lignite mines, chemical plants, bentonite grinding units, and ports (Kandla / Mundra). Workers face extreme occupational hazards including:
- **Severe Wet-Bulb Heat Stress & UV Radiation**: Ambient temperatures frequently exceed 42°C with high relative humidity.
- **Respirable Crystalline Silica & Particulate Dust**: Dry drilling, quarrying, and mineral milling without adequate dust suppression.
- **Continuous Noise Exposure (>85 dBA)**: Heavy earthmovers, screening mills, and marine cargo machinery.
- **Fragmented Medical Follow-up**: Transient migrant labor with lost physical health records and delayed treatment for chronic silicosis and heat exhaustion.

**WorkCheck Kachchh** bridges the critical gap between field hazards, health screening, and longitudinal clinical follow-up by providing:
1. **Exposure-Triggered Worker Screening**: Automated risk scoring triggering clinical outreach before irreversible organ damage.
2. **Ayushman Bharat Health Account (ABHA) Integration**: Digital health record wallet with QR-coded worker ID cards and multilingual summaries.
3. **Multi-Role Clinical Portal**: Role-based operational views for Field Doctors, Clinic Coordinators, Factory Inspectors, and District Health Officers (DDO Kachchh).
4. **IoT Environmental Bridge**: Real-time integration with ESP32 edge sensors for ambient wet-bulb globe temperature (WBGT), noise, and PM2.5/PM10 monitoring.

---

## 🏗️ System Architecture & Dual Deployment Model

```
+---------------------------------------------------------------------------------+
|                               WORKCHECK KACHCHH                                 |
+---------------------------------------------------------------------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                                                     |
     v                                                                     v
[Static Mode (GitHub Pages)]                                [Full Stack Production]
- Single-page reactive UI (index.html)                      - FastAPI REST Core (app/main.py)
- Pre-seeded synthetic Kachchh datasets                     - SQLite relational engine (app.db)
- Leaflet geo-spatial hazard mapping                        - Multi-role RBAC authentication
- Client-side ABHA QR card generator                       - Wokwi ESP32 IoT telemetry bridge
- Zero server maintenance, 100% uptime                     - Automated WhatsApp / SMS triggers
```

---

## 📂 Repository Structure

```
WorkCheck-Kachchh-PS000109/
├── .github/
│   └── workflows/pages.yml         # Automated GitHub Actions deployment pipeline
├── index.html                      # Interactive web dashboard (Client-side fallback ready)
├── README.md                       # Master platform documentation
├── REPORT.md                       # Comprehensive clinical & technical evaluation report
├── INSIGHTS.md                     # Deep epidemiological & operational insights
├── MASTER_DATA_GUIDE.md            # Schema definitions, hazard thresholds & data dictionary
├── HOW_TO_USE_THIS_DATA.txt        # Field coordinator guide for data ingestion
├── WorkCheck_SFIC_Synopsis.pptx    # Official SSIP SFIC 2026 presentation deck
│
├── documents/                      # Academic research, synopsis & competition guides
│   ├── PS000109 Deep Research.pdf  # Deep hazard, systemic & competitor research
│   ├── PS000109 Synopsis.pdf       # Formal submission synopsis
│   ├── SSIP PPT Guide.pdf          # SSIP Gujarat evaluation criteria guide
│   └── PPT.pdf / PPT 2.pdf         # Slide decks & presentation materials
│
├── notebooks/                      # Data synthesis & exploratory modeling
│   ├── Kachchh_Dust_Heat_Dataset_Generator.ipynb
│   └── PS000109_Proposal.ipynb
│
├── final_synopsis/                 # Standalone printable synopsis
│   ├── PS000109_Final_Synopsis.html
│   └── PS000109_Final_Synopsis.pdf
│
├── charts/                         # 11 High-resolution analytical figures & plots
│   ├── 01_temperature_trend.png
│   ├── 02_heat_index_vs_wetbulb.png
│   ├── 03_uv_radiation_cycles.png
│   └── ...
│
├── final_dataset/                  # Curated Kachchh occupational health tables (CSV)
│   ├── 128_workers_simulated.csv
│   ├── open_meteo_kachchh_hourly.csv
│   └── hazard_risk_matrix.csv
│
├── workcheck_platform/             # FastAPI Full-Stack Web Application
│   ├── app/                        # REST API routers, schemas, services, models
│   ├── data/reference.db           # Pre-compiled SQLite database with all tables
│   ├── tests/                      # Pytest test suite
│   ├── requirements.txt            # Python dependencies
│   └── run.bat / run.command       # 1-Click launcher scripts
│
├── wokwi_bridge/                   # Edge IoT Simulation (ESP32)
│   ├── fake_device.py              # Hardware simulator for temperature/noise
│   └── bridge.py                   # REST bridge pushing edge telemetry to server
│
└── simulation/                     # Multi-hazard simulation scripts
    └── combine_and_simulate.py
```

---

## 🚀 Running the Full-Stack Platform Locally

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Firefox, Safari, Edge)

### 1-Click Startup (Windows)
Double-click `run_website.bat` in the root folder, or:
```cmd
cd workcheck_platform
run.bat
```

### Manual Command Line Startup
```bash
# Navigate to platform directory
cd workcheck_platform

# Install dependencies
pip install -r requirements.txt

# Launch FastAPI web application on port 8090
python -m uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```
Open **[http://localhost:8090](http://localhost:8090)** in your browser.

### Test User Credentials
| Role | Username | Password | Operational Scope |
|---|---|---|---|
| **Field Medical Officer** | `doctor@kachchh.gov.in` | `Doctor@2026` | Clinical diagnostics, spirometry, prescriptions |
| **Site Safety Inspector** | `safety@adaniship.in` | `Safety@2026` | Real-time WBGT heat index, silica alerts, PPE audit |
| **Clinic Coordinator** | `clinic@bhuj-chc.in` | `Clinic@2026` | Worker check-in, ABHA KYC, follow-up scheduling |
| **DDO Kachchh Administrator** | `ddo@kachchh.gov.in` | `Admin@2026` | District-wide analytics, compliance & heat wave flags |

---

## 🧪 Running the Test Suite

```bash
# Run backend platform tests
cd workcheck_platform
python -m pytest tests -v

# Run IoT bridge tests
cd ../wokwi_bridge
python -m pytest -v
```

---

## 📊 Key Datasets & Ethical Compliance Notice

- **Worker Privacy & Synthetic Protection**: This repository contains synthetic, privacy-preserving simulated worker records modelled after Kachchh demographics. No Personally Identifiable Information (PII) or confidential patient medical records from actual individuals are included.
- **Meteorological & Hazard Ground Truth**: Ambient hourly weather, solar UV radiation, and heat stress indices are derived from verified ERA5 reanalysis and Open-Meteo models for coordinates `23.24°N, 69.66°E` (Bhuj, Kachchh).
- **Standards Applied**:
  - Occupational Safety and Health Administration (OSHA) permissible exposure limits (PEL)
  - Indian National Institute of Occupational Health (NIOH) guidelines for silicosis screening
  - National Health Authority (NHA) Ayushman Bharat Digital Mission (ABDM) schema

---

## 👥 Contributors & Acknowledgements

- **Jay Patel** — Platform Architect, Lead Engineer & Full-Stack Developer
- **Seva First Innovation Challenge (SFIC) 2026**
- **Student Startup and Innovation Policy (SSIP), Education Department, Government of Gujarat**
- **Office of District Development Officer (DDO), Kachchh**

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
