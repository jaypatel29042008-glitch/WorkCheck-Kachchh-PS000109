# PS000109 final dataset and simulation

Load `ps000109_final.db` (SQLite), or use the CSVs. `data_dictionary.csv` lists every table, its columns and its data class.

**Nothing here is a health record or measurement of a Kachchh worker.** The simulation uses no random numbers and contains no clinical values.

Rebuild: `python3 fetch_taluka_weather.py`, `python3 fetch_uv_2025.py`, then `python3 build_final_dataset.py`. The build needs `sfic-ps000109/` and `simulation/output/` beside this folder.

## Data classes

| Class | Meaning | How to show it |
|---|---|---|
| `MODEL` | Weather and air model estimates | "Model estimate" |
| `PUBLIC_MEASURED` | Measured, but not Kachchh workers | Name the place and source |
| `OFFICIAL` | Official or published statistic | Cite it; check the age |
| `RULE` | Read from a legal or published table | Cite it |
| `DERIVED` | Calculated from the above | "Scenario", and name the inputs |
| `ASSUMPTION` | Team placeholder | "Proposed" until reviewed |
| `FICTIONAL` | Scripted demo workers | Always label as fictional |

## Tables for the dashboard

| Screen | Tables |
|---|---|
| District map and priority | `locality_heat_priority_2025`, `talukas`, `district_facts`, `kachchh_nfhs5_health_indicators` |
| Site or job view | `location_daily_2025`, `location_hourly_2025`, `heat_by_job_2025`, `job_profiles` |
| Worker journey from A to B | `simulation/sim_workers`, `sim_worker_assignments`, `sim_case_events`, `sim_worker_summary` |
| Worker exposure over time | `simulation/sim_daily_exposure`, `sim_alerts` |
| Silica scenario | `silica_scenarios`, shown as a P75 and P90 range |
| Rules and evidence | `rules_routing`, `rules_heat_work_table`, `condition_data_map`, `published_evidence` |
| Disease tracking | `condition_tracking_rules`, `simulation/sim_worker_condition_status`, `sim_condition_summary`, `sim_symptom_reports` |
| New alert parameters | `sensor_parameters`, `job_noise_scenarios`, `simulation/sim_parameter_triggers`, noise, UV and hours columns in `sim_daily_exposure` |
| Rule-engine tests | `simulation/route_test_matrix` |

## New parameters

| Parameter | Data used here | Status |
|---|---|---|
| **UV dose** | Open-Meteo modelled UV index for all 12 locations | Real model data; excludes salt-pan reflection |
| **Noise dose** | `job_noise_scenarios` | Only stone crushing cites a published figure; the rest are placeholders |
| **Hydration** | `urine_colour_score_scripted` | Fully scripted; not a measurement |
| **Work hours** | `shift_duration_hours`: 9 hours, or 11 for some workers from March to June | Scripted pattern |

With 85 dBA placeholders and a 9-hour shift, most noisy jobs pass 100% daily dose, so **the noise trigger cannot rank workers until real site levels replace the placeholders.**

## The 128-worker simulation

- **8 narrative workers** tell specific journeys.
- **120 designed workers** cross 10 job and employer pairs, 4 ages and 3 tenure bands.
- **Symptoms, missed visits and doctor outcomes** follow a fixed pattern that tests every path. The shares are not evidence.
- **`CONDITION_NOTED_DEMO`** is scripted. Show it only as a labelled demo state, never as a disease count.
- **No test values** are generated: no X-ray, spirometry or creatinine results.

**Even a larger fictional cohort cannot show how common a disease is in Kachchh. Only real screening records can.**

## Dashboard rules

- **Exposure review:** show both P75 and P90 until a clinician picks a rule. The 0.5 threshold is a placeholder.
- **`cumulative_dust_dose_mg_m3_hr`:** outdoor modelled PM2.5, kept for the dashboard's schema. Never use it as a silica trigger.
- **Clinical fields:** leave them empty in the demo. Do not fill them from the `_real` files in the GitHub repo, which are generated.
- **`locality_heat_priority_2025`:** heat only. It is not a final outreach ranking, because worker counts by job are missing.

## Known limits

- **Coverage:** the 12 points are coarse model cells, not worksites. Abdasa and Little Rann points are approximate.
- **Dust model:** modelled PM10 is nearly the same across many sites, so it cannot rank local dust. Only site readings can.
- **Silica:** US inspection samples, often targeted, with many recorded zeros. Ceramics has only 9 samples from 2 firms.
- **Assumptions:** workloads, Sundays off, a 9-hour shift, and each fictional journey.
- **Age of figures:** population is 2011, and facility counts come from a page last updated in 2018.

## Still missing

| Data | Where to get it |
|---|---|
| Worker counts by job and taluka | e-Shram, Census tables, labour office, CDHO |
| Current PHC, CHC and van routes | CDHO, BOCW board |
| Screening and referral records | CDHO or clinic partner, with approval and consent |
| TB counts | District TB office |
| Measured site heat and dust | Site-node pilot |
| Site silica share | Lab analysis of proper air samples |
| Clinician-approved referral rules | NIOH or an occupational doctor |
| Ministry-confirmed jurisdiction for Mundra | Labour office or the OSH Code text |

## Sources

- [Open-Meteo](https://open-meteo.com/) (ERA5 and CAMS)
- [Census 2011 taluka populations](https://citypopulation.de/en/india/gujarat/admin/468__kachchh/)
- [Taluka village counts](https://villageinfo.in/gujarat/kachchh/)
- [Kachchh District at a Glance](https://kachchh.nic.in/?p=2746)
- [NFHS-5 district extract](https://github.com/pratapvardhan/NFHS-5)
- [OSHA health samples](https://www.osha.gov/opengov/healthsamples)
- [CCOHS heat stress criteria](https://www.ccohs.ca/oshanswers/phys_agents/heat/CCOHS_heat_control.pdf)
- [Gujarat OSH Rules 2025](https://col.gujarat.gov.in/Portal/Document/3_3124_1_Gujaratrules_3_24062026.pdf)
- [Central OSH Rules 2026](https://www.labour.gov.in/static/uploads/2026/05/ee246f790cad0b8e99c3828f34fa09a6.pdf)
- [Wokwi ESP32 Wi-Fi guide](https://docs.wokwi.com/guides/esp32-wifi)
