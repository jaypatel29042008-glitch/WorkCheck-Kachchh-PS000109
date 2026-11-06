# WorkCheck Kachchh

Worker health follow-up for Seva First Innovation Challenge 2026 / SSIP Gujarat, problem statement **PS000109: Digital Occupational Health Monitoring for Industrial Workers** (DDO Kachchh).

[![Live Website](https://img.shields.io/badge/Live%20Platform-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://jaypatel29042008-glitch.github.io/WorkCheck-Kachchh-PS000109/)
[![SSIP Gujarat](https://img.shields.io/badge/SSIP%20Gujarat-2026-blue?style=for-the-badge)](https://ssipgujarat.in/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20SQLite-teal?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

**This repo holds no real Kachchh worker health data.** Workers are fictional, heat and UV are model estimates, and silica and noise values come from outside Kachchh. Every table carries a label saying which is which.

---

## 🌐 Live Website (Zero Install)

Open the live interactive application directly in your browser:

👉 **[https://jaypatel29042008-glitch.github.io/WorkCheck-Kachchh-PS000109/](https://jaypatel29042008-glitch.github.io/WorkCheck-Kachchh-PS000109/)**

### Demo Sign-In Accounts

| Role | Email | Password | What it opens |
|---|---|---|---|
| **Clinic team** | `clinic@workcheck.demo` | `Demo-Clinic-2026` | Today's triage, all 128 worker records, check results recording, facility referral |
| **District office** | `ddo@workcheck.demo` | `Demo-DDO-2026` | Macro taluka totals, heat & dust map, CSV export |
| **Site supervisor** | `site@workcheck.demo` | `Demo-Site-2026` | Real-time site monitor, heat map, and Wokwi ESP32 IoT node |
| **Worker** | `worker@workcheck.demo` | `Demo-Worker-2026` | Worker health pass (Kishan P.), QR code, and symptom reporting |

---

## 🚀 Run the Platform Locally (Full-Stack Mode)

```bash
cd workcheck_platform
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --port 8090
```

Then open **http://localhost:8090** in your browser. On Windows, you can double-click `run.bat` or `run_website.bat`.

---

## 📂 Repository Structure

| Folder / File | What it holds |
|---|---|
| `index.html`, `styles.css`, `js/`, `assets/` | Modern client application deployed directly on GitHub Pages |
| `workcheck_platform/` | The full-stack app: FastAPI backend, authentication, reference SQLite database, and tests |
| `final_dataset/` | Complete empirical datasets (CSV tables, 128 simulated workers, ERA5 weather, CPCB PM data, data dictionary) |
| `simulation/` | Hazard models, multi-parameter exposure calculations, and simulation outputs |
| `wokwi_bridge/` | ESP32 IoT hardware bridge and sensor simulation |
| `charts/` | High-resolution analytical figures and plots |
| `final_synopsis/` | Problem Statement PS000109 synopsis document (HTML & PDF) |

---

## 🧪 Tests

```bash
cd workcheck_platform
python -m pytest tests -q
```

```bash
cd wokwi_bridge
python -m pytest -q
```
