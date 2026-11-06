# PS000109 – Digital Occupational Health Monitoring (Kachchh)
## Master Data Guide, Scientific Concepts & Implementation Manual

**Challenge:** Seva First Innovation Challenge 2026 · Problem Statement **PS000109**  
**Target User:** District Development Office (DDO), Kachchh (Gujarat, India)  
**Synopsis Due Date:** **06 November 2026**  
**Repository:** `sfic-ps000109`

---

## 1. Executive Summary & The 3 Pitch Numbers

> [!IMPORTANT]
> **Our Core Idea:** A low-cost solar-powered worksite sensor node measures heat stress (WBGT) and airborne particulates (PM10/PM2.5). When environmental exposure crosses safe clinical thresholds:
> 1. The worker receives an automated SMS alert in Gujarati or Hindi on their basic feature phone.
> 2. The worker is added to a check-up priority list for existing services (BOCW schemes and health van, salt-worker medical van, ESIC dispensaries); a clinician decides the tests, such as spirometry, chest X-ray and kidney function.
> 3. The test result is uploaded to a worker-owned, portable digital health record linked to their national **e-Shram Universal Account Number (UAN)**.
> 4. The District Development Officer (DDO) accesses an anonymous district dashboard showing industrial hotspots, contractor compliance, and heat trends across Kachchh.

### The 3 Core Numbers for the Synopsis & Presentation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. A 6 AM START CUTS HEAT DANGER BY ~20% WITH THE SAME 9-HOUR SHIFT         │
│ Moving 9 AM–6 PM to 6 AM–3 PM avoids ~358 hazardous hours/year (modelled).  │
│ A 6 AM–1 PM shift avoids ~816 h (45%) but is 2 hours shorter each day.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. SAME WORKPLACE, VERY DIFFERENT DUST (WHY INDIVIDUAL TRACKING MATTERS)    │
│ In 29 of 56 multi-sample OSHA inspections with a result over 50 µg/m³,      │
│ another sample was under 25 µg/m³. US data, targeted inspections.           │
│ Site averages can hide high exposures, so link records to e-Shram IDs.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. THE INVISIBLE COASTAL TRAP & TROPICAL NIGHT HEAT DEBT                    │
│    At Kandla & Mundra ports, summer air temperatures look mild (31–34 °C),   │
│    but 65%–69% humidity drives WBGT over danger limits for 2,067 hours.     │
│    Worse, >54% of hot days are followed by nights with WBGT >= 25 °C.       │
│    Our algorithm carries over "heat debt" to lower the next day's limit.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Reading Facts & Evidence Base

Every number below is extracted directly from verified files and peer-reviewed papers in this repository:

| # | Metric / Claim | Verified Number | Context / Location | Source File / Paper | Scientific Caveat |
|---|---|---|---|---|---|
| **1** | **Outdoor Heat Burden** | **2,067 working hours** (56.6% of daytime hours in 2025) | Kandla Port, Gujarat (2025) | [kachchh_heat_dust_summary.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/kachchh_heat_dust_summary.csv) | Open-Meteo ERA5 atmospheric model (~30 km grid) + Liljegren solar physics formula; not a physical meter on a worker's chest. |
| **2** | **Sustained Heat Days** | **237 days in 2025** with $\ge 4$ daytime hours over 27.5 °C WBGT | Kandla Port, Gujarat (2025) | [kachchh_heat_dust_summary.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/kachchh_heat_dust_summary.csv) | Indicates chronic, multi-month occupational heat strain rather than isolated heatwave anomalies. |
| **3** | **Shift Rescheduling** | Same 9-hour shift, 6 AM–3 PM vs 9 AM–6 PM: avoids **~358 hazardous hours/year (19.9%)**. Shorter 6 AM–1 PM shift: **~816 h (45.3%)**, but 2 fewer work hours a day | All 5 Kachchh sites (2025) | Hourly WBGT in `scripts/data/`; [insights.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/insights.csv) (Q2) | Modelled outdoor hours for a worker on every day of the year; assumes a 9 AM–6 PM baseline and that logistics can accommodate early work. |
| **4** | **Value of Worksite Shade** | Drops WBGT by **~2.7 °C** and relieves **58.9%** (1,062–1,202 h) of danger hours | All 5 Kachchh sites (2025) | [insights.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/insights.csv) (Q3) | Bernard indoor model ($T_g = T_a$); 604 to 997 hours remain hazardous even in full shade due to coastal humidity. |
| **5** | **Nocturnal Heat Debt** | **54.8% of dangerous days** followed by tropical nights ($\text{WBGT} \ge 25\text{ }^\circ\text{C}$) | Mundra (57.3%) & Kandla (52.3%) | [insights.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/insights.csv) (Q4) | Ambient model; does not account for tin-roof heat trapping or electric fans in worker dormitories. |
| **6** | **Peak Regional Heat** | Peak daytime WBGT reached **37.4 °C** in 2024 and **37.2 °C** in 2025 | Little Rann of Kutch (Salt pans) | [kachchh_heat_dust_summary.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/kachchh_heat_dust_summary.csv) | Unshaded salt pan surface reflection (albedo) likely produces higher localized thermal loads. |
| **7** | **Compound Heat + Dust** | **81.8% to 100% of dusty days** (PM10 > 100) occurred during severe heat; Abdasa had **27 compound days** | Abdasa Cement & Mundra Port (2023–2026) | [insights.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/insights.csv) (Q1) | Regional CAMS grid model; proves that respiratory protection and heat hydration cannot be handled in isolation. |
| **8** | **Salt Pan Literature Baseline** | **87.5% of salt-pan workers** worked above ACGIH continuous work heat thresholds | Tamil Nadu (Jakobsson et al. 2023) | Cited literature | Field study on coastal salt-pan workers using calibrated QuesTemp 34 meters, not Kachchh. |
| **9** | **Gujarat Industrial Dust** | **83.3% of measured days** exceeded daily PM10 limit (100 $\mu\text{g/m}^3$) in Vatva vs. 31.4% in Gandhinagar | Vatva GIDC, Ahmedabad (2019–2020) | [cpcb_gujarat_station_summary.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/cpcb_gujarat_station_summary.csv) | CPCB outdoor continuous monitoring stations (~150 valid PM10 days), not factory indoor air. |
| **10** | **Weekday vs Sunday Dust** | Vatva PM10 averaged **149.2 $\mu\text{g/m}^3$** (1.70× Gandhinagar); dropped by 20.4 $\mu\text{g/m}^3$ on Sundays | Vatva GIDC (2019–2020) | [cpcb_gujarat_daily_pm.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/cpcb_gujarat_daily_pm.csv) | Limited sample (23 Sundays); difference does not reach statistical significance ($p = 0.117$). |
| **11** | **Personal Silica Risk** | **26.2% of 8-hour TWA samples** exceeded legal PEL (50 $\mu\text{g/m}^3$); 39.1% exceeded Action Level (25 $\mu\text{g/m}^3$) | US OSHA compliance inspections (n=599) | [osha_silica_summary_by_industry.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/osha_silica_summary_by_industry.csv) | Targeted compliance enforcement inspections; overstates general industry averages. |
| **12** | **Exposure Variation** | **29 of 56** multi-sample inspections with a result over 50 µg/m³ also had a sample under 25 µg/m³; **top 10% of samples hold 95.5%** of measured silica (~80% without the 4 highest values) | US OSHA personal samples (2014–2023; 599 samples, 218 inspections) | [osha_silica_personal_samples_2014_2023.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/processed/osha_silica_personal_samples_2014_2023.csv) | Samples, not individual workers. 46.6% are recorded as 0 (possibly non-detects), and the 4 highest are 47,600–75,100 µg/m³. Targeted inspections, not a random sample. |
| **13** | **Clinical Lung Damage** | **2.46× higher odds** of abnormal lung function ($\text{FEV}_1/\text{FVC} < 0.70$, $p = 0.0386$) | China industrial cohort (n=2,045) | [He et al. 2022](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/docs/papers/He_2022_dust_exposure_lung_function_China.pdf) | Cross-sectional screening cohort; healthy worker survivor effect may be present. |
| **14** | **Abnormal FVC Prevalence** | **12.8% of examined workers (262/2,045)** had abnormal Forced Vital Capacity ($\text{FVC} < 80\%$) | China industrial cohort (He et al. 2022) | [He et al. 2022](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/docs/papers/He_2022_dust_exposure_lung_function_China.pdf) | Prevalence only, not proof of dust damage: cross-sectional, no smoking data, and higher dust was not linked to more abnormal FVC in this study (OR 0.68). |
| **15** | **Long-Term Exposure Risk** | Exposure **over 10 years vs 5 or under: 3.32× higher odds** of pneumoconiosis-like changes (95% CI 1.14–9.69) | China industrial cohort (He et al. 2022) | [He et al. 2022](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/docs/papers/He_2022_dust_exposure_lung_function_China.pdf) | Only 17 cases, so the interval is wide. The paper's text and Table 1 say >10 years; Table 3 labels this row >15. Do not use the age figure (OR 5.84): its interval, 0.76–44.81, includes 1. |
| **16** | **Sensor Disagreement** | Optical sensors measuring identical concrete mixing diverged by **31.3×** (~10,931 vs ~349); units omitted | Mendeley Construction PM Dataset (`wy6shdctsr`) | [DIB_data_Construction_PM.xlsx](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/raw/mendeley_construction_pm/DIB_data_Construction_PM.xlsx) | Author omitted engineering units; proves low-cost optical sensors must be calibrated against site gravimetric filters. |
| **17** | **Task Spike Dilution** | Concrete mixing peak is **2.18× the 40-min mean** and >30× background; 8-h TWA divides it by 30× | Mendeley Construction PM Dataset (2019) | [DIB_data_Construction_PM.xlsx](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/raw/mendeley_construction_pm/DIB_data_Construction_PM.xlsx) | Proves the necessity of a 15-minute Short-Term Exposure Limit (STEL) trigger to prevent spike dilution. |
| **18** | **Hardware Glitches** | Low-cost PMS sensors produced **732 to 976 false spike events/year** ($>10,000\text{ }\mu\text{g/m}^3$) | US Sand Mine study (NIOSH 2024) | [NIOSH 2024](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/docs/papers/NIOSH_2024_low_cost_dust_monitors_case_study.pdf) | Firmware must reject single-second spikes $>10,000\text{ }\mu\text{g/m}^3$ to prevent false medical appointments. |
| **19** | **Sensor Economics** | Low-cost dust package costs **<\$300**, vs. commercial mining monitors averaging **~\$5,000** | US Sand Mine study (NIOSH 2024) | [NIOSH 2024](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/docs/papers/NIOSH_2024_low_cost_dust_monitors_case_study.pdf) | This compares NIOSH's own package, not ours. Our parts estimates are ~₹2,000 per site node plus ~₹1,700–1,900 per badge: retail estimates, uncalibrated, not certified instruments. |
| **20** | **Contractor Risk** | **58.8% of industrial accident victims (258/439)** were contractors; suffered **5.6× higher fatal/Level V rates** | IHM Stefanini mining & metals (Brazil, 2016–17) | [IHMStefanini...database.csv](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/data/raw/accidents_ihm_stefanini/IHMStefanini_industrial_safety_and_health_database.csv) | Foreign safety injury data (not chronic illness); highlights vulnerability of outsourced/migrant labor. |

---

## 3. Master Chart Showcase & Presentation Placement

The figures below are generated at 150 DPI in the `charts/` directory:

### Chart 1: The Local Heat Crisis in Kachchh
- **File:** [charts/kachchh_heat_hours_by_site.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/kachchh_heat_hours_by_site.png)
- **Slide 3:** *"The Local Reality: Heat Crisis in Kachchh"*
- **Core Insight:** In 2025, Kandla Port workers endured **2,067 hours** exceeding 27.5 °C WBGT in the sun (56.6% of daytime work hours). Even with shade, 997 hours breached safe limits.

### Chart 2: The 7-Month Seasonal Danger Window
- **File:** [charts/kachchh_heat_by_month.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/kachchh_heat_by_month.png)
- **Slide 4:** *"Seasonality & The 7-Month Danger Window"*
- **Core Insight:** Extreme heat is not a brief heatwave; it runs uninterrupted from **April through October**, peaking at 260–290 hours/month in May, June, July, and September.

### Chart 3: Zero-Cost Policy Solution — Early Morning Shifts
- **File:** [charts/insight_2_diurnal_shift_rescheduling.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/insight_2_diurnal_shift_rescheduling.png)
- **Slide 5:** *"Actionable Administrative Policy: Shift Rescheduling"*
- **Core Insight:** Heat rises past 50% probability between 8 AM and 9 AM and peaks at 69% between 12 PM and 2 PM. A **6 AM–3 PM shift avoids ~358 h/year (~20%)** with the same 9 working hours; a **6 AM–1 PM shift avoids ~816 h (45.3%)** but is 2 hours shorter each day.

### Chart 4: Why Physical Sheds Alone Fail
- **File:** [charts/insight_3_value_of_shade.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/insight_3_value_of_shade.png)
- **Slide 6:** *"Limits of Physical Infrastructure: Why Shade Is Not Enough"*
- **Core Insight:** Shade drops WBGT by ~2.7 °C and solves ~59% of danger hours, but coastal maritime humidity leaves 604 to 997 hours hazardous even under complete shade.

### Chart 5: Sleepless Nights & Compounding Heat Debt
- **File:** [charts/insight_4_night_recovery_deficit.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/insight_4_night_recovery_deficit.png)
- **Slide 7:** *"Cumulative Physiological Strain: No Recovery at Night"*
- **Core Insight:** Over **54% of dangerous heat days** at coastal ports are followed by tropical nights ($\text{WBGT} \ge 25\text{ }^\circ\text{C}$), leaving less chance to recover overnight. This is an outdoor model and does not measure workers' hydration.

### Chart 6: Why Area Monitors Can Miss High Exposures
- **File:** [charts/insight_7_exposure_pareto_skew.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/insight_7_exposure_pareto_skew.png)
- **Slide 8:** *"Why Area Monitors Can Miss High Exposures"*
- **Core Insight:** In OSHA personal samples, **the top 10% of samples hold 95.5% of measured silica**, and in **29 of 56** multi-sample inspections with a result over the limit, another sample was under the action level. These are US samples, not individual workers, and 46.6% are recorded as 0.

### Chart 7: Task Spikes & Optical Sensor Disagreement
- **File:** [charts/mendeley_dust_trace.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/mendeley_dust_trace.png)
- **Slide 9:** *"Sensor Engineering: Calibration, Spikes & Short-Term Limits"*
- **Core Insight:** Concrete mixing produces acute dust spikes 2.18× higher than 40-minute averages that 8-hour TWAs dilute into invisibility. Low-cost sensors diverge by 31.3× and require site gravimetric calibration.

### Chart 8: Multi-Hazard Reality — Dust Meets Extreme Heat
- **File:** [charts/insight_1_compound_hazard_days.png](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/charts/insight_1_compound_hazard_days.png)
- **Slide 10:** *"The Multi-Hazard Reality: Dust Meets Extreme Heat"*
- **Core Insight:** High dust almost never occurs in cool weather (82%–100% co-occur with severe heat). Abdasa Cement had **27 compound days**. Alerts must bundle hydration with mask compliance.

---

## 4. System Inputs, Schemas & Thresholds

### A. Ingestion Telemetry Payload (JSON)
Agreed format across device firmware, database, and backend API:

```json
{
  "device_id": "kandla-berth-04",
  "time": "2026-11-05T13:30:00+05:30",
  "temp_c": 34.2,
  "humidity_rh": 68.0,
  "globe_temp_c": 49.5,
  "wind_ms": 2.1,
  "pm10": 145.0,
  "pm25": 72.0
}
```

### B. Clinical & Regulatory Rule Thresholds (Store in `rules` Table)

| Rule / Trigger Parameter | Threshold Value | Regulatory / Medical Source | Automated System Action |
|---|---|---|---|
| **WBGT Heavy Work Warning** | **26.0 °C** | ACGIH / Project Choice | Sends hydration reminder SMS to workers. |
| **WBGT Heavy Work Mandatory Action** | **27.5 °C** | ACGIH TLV (continuous heavy labor) | Sends rest-break alert SMS (15 min rest in shade/hour). |
| **WBGT Moderate Work Action** | **28.0 °C** | ACGIH TLV (moderate labor) | Triggers alert for crane/equipment operators. |
| **Acute Dust Task Trigger (15-min STEL)** | **300 µg/m³** | 15-minute rolling average | Sends immediate SMS to wear respirators or start water sprays. |
| **Chronic Dust Action (8-hour TWA)** | **Silica estimate ≥ 50 µg/m³** (warning at 25), where a lab-tested site silica % exists; otherwise **PM10 ≥ 100 µg/m³** as a screening flag | OSHA PEL / NIOSH REL. The PM10 value is our choice, borrowed from India's outdoor NAAQS 24-hr standard; it is not a workplace limit | Adds the worker to the check-up priority list; a clinician decides the tests. |
| **Hardware Glitch Rejection Filter** | **> 10,000 µg/m³** | NIOSH 2024 Sand Mine Study | Firmware immediately discards reading as electrical noise. |
| **Nocturnal Heat Debt Carryover** | Night **WBGT $\ge 25.0\text{ }^\circ\text{C}$** | Circadian Biometeorology (Roye 2021) | Lowers next day's daytime threshold by $1.0\text{ }^\circ\text{C}$ (to **26.5 °C**). |

### C. Hardware Bill of Materials (BOM) & Sensor Architecture

```
┌────────────────────────────────────────────────────────┐
│ SOLAR SITE NODE (about ₹2,000)                         │
├────────────────────────────────────────────────────────┤
│ • Microcontroller: ESP32 NodeMCU (Wi-Fi + BLE)  ₹450   │
│ • Air Temp & Humidity: SHT31 (±0.2 °C, ±2% RH)  ₹250   │
│ • Black Globe: DS18B20 + 150mm Copper Sphere    ₹350   │
│ • Power: 5W Solar Panel + TP4056 + 18650 Li-ion ₹600   │
│ • Weatherproof Enclosure & PCB: IP65 Box        ₹300   │
├────────────────────────────────────────────────────────┤
│ PERSONAL DUST BADGE (about ₹1,700–1,900)               │
├────────────────────────────────────────────────────────┤
│ • Microcontroller: ESP32 NodeMCU                ₹450   │
│ • Particulate Matter: Plantower PMS5003         ₹950   │
│ • Battery, charger, enclosure            ₹300–500      │
└────────────────────────────────────────────────────────┘
```
*(Retail estimates, not quotes. The synopsis lists the badge at ₹1,500, the low end of its own part prices. NIOSH 2024 reports <\$300 low-cost packages vs ~\$5,000 commercial monitors; that is not a price comparison for our parts, which still need calibration.)*

---

## 5. Team-by-Team Implementation Blueprint

### 🧑‍💻 1. For Neel (Database & Rules in `db/`)
- Build the schema in `db/` with tables: `sites`, `devices`, `workers`, `readings`, `daily_exposure`, `rules`, `alerts`, `checkups`.
- Store all thresholds as **data in the `rules` table**, not hardcoded in application logic.
- Implement the **Nocturnal Heat Debt trigger**: If nighttime WBGT (8 PM to 6 AM) stays $\ge 25\text{ }^\circ\text{C}$, automatically lower the daytime trigger threshold for that worker group by $1.0\text{ }^\circ\text{C}$.

### 🛠️ 2. For Person 2 (Wokwi Device Mock-up & Firmware)
- Implement Bernard natural wet bulb and ISO WBGT calculation in C++/MicroPython:
  $$T_{nwb} = T_{pwb} + 0.25 \cdot (T_g - T_a) + \frac{0.1}{v^{1.1}} - 0.2$$
  $$\text{WBGT} = 0.7 \cdot T_{nwb} + 0.2 \cdot T_g + 0.1 \cdot T_a$$
- Maintain a **15-minute rolling ring buffer** (450 samples at 2-sec intervals) for the STEL trigger.
- Add the single-second spike filter: `if (pm10 > 10000) return;`.

### 🏥 3. For Person 3 (Government Integration & DDO Dashboard)
- Worker enrollment tied to their 12-digit **e-Shram Universal Account Number (UAN)** and **ABHA ID**.
- Priority worklists for check-ups through existing services: BOCW schemes and health van, salt-worker medical van, ESIC dispensaries. Confirm each scheme's current rules before naming it. Treat any automatic booking API as future work unless someone confirms one exists.
- Bilingual SMS text messaging in Gujarati and Hindi:
  > *"સાવધાન! કંડલા પોર્ટ પર ગરમીનું સ્તર ૨૮.૫°C પહોંચી ગયું છે. છાંયડામાં ૧૫ મિનિટ આરામ કરો અને ઓઆરએસ પાણી પીવો. તમારી મફત તપાસ સીએચસી (CHC) ખાતે બુક કરવામાં આવી છે."*
- Build the DDO dashboard to display anonymous spatial compliance heat-maps and automated seasonal shift advisories.

### 📊 4. For Person 4 (Synopsis & PPT Slide Deck)
- Build the 10-slide presentation embedding the charts from `charts/` following the placement guide in Section 3.
- Highlight the **3 Core Pitch Numbers** on slides 3, 5, and 8.
- Draft the official synopsis document due **06 November 2026** using the text in [REPORT.md](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/REPORT.md) and [INSIGHTS.md](file:///Users/neelbrahmbhatt/Downloads/Dust%20Data%20for%20SSIP/sfic-ps000109/INSIGHTS.md).

---

## 6. Scientific Concepts Cheatsheet

- **Wet Bulb Globe Temperature (WBGT — ISO 7243):**
  Combines air temperature ($T_a$), humidity ($T_{nwb}$), wind speed, and solar radiant heat ($T_g$). Standard formula:
  $$\text{WBGT}_{\text{sun}} = 0.7 \cdot T_{nwb} + 0.2 \cdot T_g + 0.1 \cdot T_a$$
- **8-Hour Time-Weighted Average (TWA) vs. 15-Minute STEL:**
  8-hour TWA averages exposure over an entire 480-minute shift ($\sum C_i t_i / 480$). It washes out short, intense 15-minute toxic dust clouds. A 15-minute Short-Term Exposure Limit (STEL) captures acute spikes.
- **Spirometry Lung Mechanics:**
  - $\text{FEV}_1$: Forced Expiratory Volume in 1 second.
  - $\text{FVC}$: Forced Vital Capacity.
  - $\text{FEV}_1/\text{FVC} < 0.70$: Clinical threshold for obstructive pulmonary disease. Workers exposed to dust have **2.46× higher odds** of abnormal airflow (He et al. 2022).
- **Exposure Variation Across Samples:**
  The top 10% of OSHA samples hold 95.5% of measured silica (~80% without the 4 highest values). Do not quote the Gini figure: 46.6% of samples are recorded as 0, which inflates it, and samples are not workers.

---

## 7. Defense Rules for Judges' Questions

> [!TIP]
> **Q: "Did you measure this in Kachchh yourselves?"**  
> **A:** *"No. These are atmospheric models from Open-Meteo (ERA5 weather reanalysis and CAMS air quality) at 30–40 km grid resolution. They prove the macro-environment is hazardous, but worksite microclimates (quarries, salt crusts) will have even higher local extremes. That is exactly why physical IoT nodes are needed."*

> [!TIP]
> **Q: "Why did you use US OSHA data for silica?"**  
> **A:** *"We did not find an open Indian dataset of personal worker silica samples. OSHA's 599 US samples show that results can differ widely inside one workplace: in 29 of 56 multi-sample inspections with a result over the limit, another sample was under the action level. It is targeted US data, so it supports individual tracking but says nothing about Kachchh levels."*

> [!TIP]
> **Q: "Can't employers just build a shade roof?"**  
> **A:** *"Our data proves shade drops WBGT by ~2.7 °C and solves ~59% of danger hours, but high coastal humidity leaves 600 to 997 hours dangerous even in full shade. Cooling requires airflow fans, electrolyte hydration, and shift rescheduling."*

> [!TIP]
> **Q: "Why not alert on 8-hour TWA?"**  
> **A:** *"Mendeley construction data proves that short acute bursts (like 16 minutes of dry concrete mixing) get diluted by 30× in an 8-hour average. We use a 15-minute STEL for immediate worker protection and 8-hour TWA for doctor check-ups."*

