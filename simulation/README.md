# PS000109 scenario outputs

**These are scenarios from public and model data. They are not measurements of Kachchh workers.** Show this label wherever they appear in the dashboard or demo.

Run: `python3 combine_and_simulate.py`. It uses no random numbers.

## How the datasets connect

There is no worker-level join between these sources. They connect through shared keys:

| Key | Connects | Used for |
|---|---|---|
| Site and hour | Open-Meteo weather and air model | Hourly WBGT, modelled PM10 |
| Job to workload | Heat data and the CCOHS work-rest table | Allowed work hours (workload is our assumption) |
| Job to industry | OSHA silica samples | Silica scenario ranges (US data) |
| Minute of task | Mendeley sensor trace | Dust replay in Wokwi (units to confirm) |
| Age, employer, years, symptoms | Fictional profiles and the routing rules | Who gets which route |

## Files in `output/`

| File | Contents | Use in |
|---|---|---|
| `heat_by_job_2025.csv` | Allowed hours, hours at each work level, 9am-6pm and 6am-3pm | Dashboard |
| `heat_by_job_month_2025.csv` | Allowed hours per shift, by job and month | Dashboard chart |
| `heat_engine_comparison.csv` | Rules engine vs CCOHS table | Team check |
| `dust_model_by_site_2025.csv` | Modelled PM10, PM2.5 and hot days by site | Dashboard |
| `silica_scenarios_by_industry.csv` | US P50, P75 and P90 silica, and years to benchmarks | Dashboard, labelled US data |
| `persona_routing_scenarios.csv` | 8 fictional workers and their routes | Demo |
| `wokwi_heat_replay.csv` | 24 hours each for Kandla and Little Rann, typical May 2025 days | Wokwi |
| `wokwi_dust_replay_by_minute.csv` | 41-minute sensor trace | Wokwi |

## Placeholders to confirm

- **Exposure review threshold:** 0.5 mg/m3-years at P90. A clinician must confirm or replace it.
- **Workload classes:** our assumption for each job.
- **Job to industry mapping:** no silica mapping for port, salt-pan or truck work.
- **Fictional profiles:** chosen to test each route, so counts say nothing about Kachchh.
