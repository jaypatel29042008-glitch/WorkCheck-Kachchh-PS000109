"""Build the PS000109 final dataset and worker-journey simulation.

Run after fetch_taluka_weather.py: python3 build_final_dataset.py
Uses no random numbers. Every table carries a data class in data_dictionary.csv.
"""
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT / "sfic-ps000109"
RAW = HERE / "raw"
TABLES = HERE / "tables"
SIM = HERE / "simulation"
for d in (TABLES, SIM):
    d.mkdir(exist_ok=True)
sys.path.insert(0, str(REPO / "scripts"))
from wbgt_rebuild import cos_solar_zenith, wbgt_shade_bernard, wbgt_sun_liljegren  # noqa: E402

YEAR = 2025
SCENARIO = "SCENARIO - fictional workers on model and US data; not Kachchh worker measurements"
DICTIONARY = []
CLASSES = {
    "MODEL": "Weather and air model estimate, not a worksite measurement",
    "PUBLIC_MEASURED": "Measured public data, but not of Kachchh workers",
    "OFFICIAL": "Official or published statistic",
    "RULE": "Rule read from a legal or published table",
    "ASSUMPTION": "Team assumption or placeholder, needs review",
    "DERIVED": "Calculated from the classes named in the table note",
    "FICTIONAL": "Scripted scenario for demo and testing; not real people",
}


def save(df, name, data_class, note, folder=TABLES):
    df.to_csv(folder / f"{name}.csv", index=False)
    DICTIONARY.append({"table": name, "folder": folder.name, "rows": len(df), "data_class": data_class,
                       "meaning": CLASSES[data_class], "note": note, "columns": ", ".join(df.columns)})
    return df


# ---------------------------------------------------------------------------
# Locations and hourly data
# ---------------------------------------------------------------------------
POP = {"Abdasa": 117538, "Anjar": 235537, "Bhachau": 186035, "Bhuj": 443269, "Gandhidham": 327166,
       "Lakhpat": 62552, "Mandvi": 203373, "Mundra": 153219, "Nakhatrana": 146367, "Rapar": 217315}
VILLAGES = {"Abdasa": 157, "Anjar": 70, "Bhachau": 73, "Bhuj": 187, "Gandhidham": 10,
            "Lakhpat": 101, "Mandvi": 98, "Mundra": 64, "Nakhatrana": 134, "Rapar": 100}
LOCATIONS = [  # id, label, taluka, type, source file group
    ("bhuj", "Bhuj", "Bhuj", "town and construction", "repo"),
    ("kandla_port", "Kandla Port", "Gandhidham", "port", "repo"),
    ("mundra_port", "Mundra Port", "Mundra", "port", "repo"),
    ("little_rann_kutch", "Little Rann salt pans (approx.)", "Rapar", "salt pan", "repo"),
    ("abdasa_cement", "Abdasa cement belt (approx.)", "Abdasa", "cement", "repo"),
    ("anjar", "Anjar", "Anjar", "town", "new"),
    ("bhachau", "Bhachau", "Bhachau", "town", "new"),
    ("gandhidham", "Gandhidham", "Gandhidham", "town", "new"),
    ("lakhpat", "Lakhpat", "Lakhpat", "town", "new"),
    ("mandvi", "Mandvi", "Mandvi", "town", "new"),
    ("nakhatrana", "Nakhatrana", "Nakhatrana", "town", "new"),
    ("rapar", "Rapar", "Rapar", "town", "new"),
]


def add_wbgt(df, lat, lon):
    sun, shade = [], []
    for r in df.itertuples():
        wind = r.wind_speed_10m / 3.6
        cz = cos_solar_zenith(r.time - pd.Timedelta(minutes=30), lat, lon)
        sw = r.shortwave_radiation
        fdir = (r.direct_radiation / sw) if sw > 1 else 0.0
        sun.append(wbgt_sun_liljegren(r.temperature_2m, r.relative_humidity_2m, wind, sw if cz > 0 else 0.0,
                                      min(max(fdir, 0), 1), cz, r.surface_pressure))
        shade.append(wbgt_shade_bernard(r.temperature_2m, r.relative_humidity_2m, max(wind * 0.67, 0.3)))
    df["wbgt_sun"], df["wbgt_shade"] = sun, shade
    return df


frames, coords = [], {}
for loc, label, taluka, kind, group in LOCATIONS:
    if group == "repo":
        d = pd.read_csv(REPO / "scripts/data" / f"hourly_{loc}_wbgt_methods.csv", parse_dates=["time"])
        d = d[d.time.dt.year == YEAR].copy()
    else:
        d = pd.read_csv(RAW / "taluka_weather_2025" / f"hourly_{loc}.csv", parse_dates=["time"])
        d = add_wbgt(d, d.latitude.iloc[0], d.longitude.iloc[0])
    d["location_id"] = loc
    coords[loc] = (round(float(d.latitude.iloc[0]), 4), round(float(d.longitude.iloc[0]), 4))
    frames.append(d[["location_id", "time", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "shortwave_radiation",
                     "pm10", "pm2_5", "dust", "wbgt_sun", "wbgt_shade"]])
HOURLY = pd.concat(frames, ignore_index=True)
HOURLY["hour"] = HOURLY.time.dt.hour
HOURLY["date"] = HOURLY.time.dt.date
HOURLY["month"] = HOURLY.time.dt.month
uv_frames = []
for loc, *_ in LOCATIONS:
    u = pd.read_csv(RAW / "uv_2025" / f"uv_{loc}.csv", parse_dates=["time"])
    u["location_id"] = loc
    uv_frames.append(u[["location_id", "time", "uv_index"]])
HOURLY = HOURLY.merge(pd.concat(uv_frames), on=["location_id", "time"], how="left", validate="one_to_one")
assert HOURLY.uv_index.notna().all()

# The new WBGT path must reproduce stored values on a repo location.
check = pd.read_csv(REPO / "scripts/data/hourly_bhuj_wbgt_methods.csv", parse_dates=["time"])
check = check[(check.time.dt.year == YEAR) & (check.time.dt.month == 5)].copy()
stored_sun, stored_shade = check.wbgt_sun.values.copy(), check.wbgt_shade.values.copy()
check = add_wbgt(check, check.latitude.iloc[0], check.longitude.iloc[0])
WBGT_CHECK = (float(np.abs(check.wbgt_sun.values - stored_sun).max()), float(np.abs(check.wbgt_shade.values - stored_shade).max()))
assert max(WBGT_CHECK) < 0.01, f"WBGT method mismatch {WBGT_CHECK}"
assert (HOURLY.groupby("location_id").size() == 8760).all()
assert sum(POP.values()) == 2092371

save(pd.DataFrame([{"location_id": l, "label": n, "taluka": t, "location_type": k, "latitude": coords[l][0], "longitude": coords[l][1],
                    "coordinate_note": "approximate worksite-belt point" if "approx" in n else "town or named-place point"}
                   for l, n, t, k, _ in LOCATIONS]), "locations", "ASSUMPTION", "Point locations; model cells are coarse, so nearby points may be similar.")
save(pd.DataFrame([{"taluka": t, "population_2011": POP[t], "villages": VILLAGES[t], "share_of_district_pct": round(POP[t] / 20923.71, 1)} for t in POP]),
     "talukas", "OFFICIAL", "Census 2011 via citypopulation.de; villages via villageinfo.in. Check against census tables before formal citation.")
HOURLY_OUT = HOURLY[["location_id", "time", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "shortwave_radiation", "pm10", "pm2_5", "dust", "uv_index", "wbgt_sun", "wbgt_shade"]].copy()
for c in ["wbgt_sun", "wbgt_shade"]:
    HOURLY_OUT[c] = HOURLY_OUT[c].round(2)
save(HOURLY_OUT, "location_hourly_2025", "MODEL", "Open-Meteo ERA5 and CAMS, IST. WBGT from team's existing Liljegren and Bernard method.")

work = HOURLY[HOURLY.hour.between(9, 17)]
day = HOURLY.groupby(["location_id", "date"]).agg(pm10_mean=("pm10", "mean"), pm25_mean=("pm2_5", "mean"), dust_mean=("dust", "mean")).reset_index()
day_work = work.groupby(["location_id", "date"]).agg(air_max_c=("temperature_2m", "max"), wbgt_sun_max=("wbgt_sun", "max"), wbgt_shade_max=("wbgt_shade", "max"),
                                                     shift_pm10_mean=("pm10", "mean"), hours_sun_over_27_5=("wbgt_sun", lambda s: int((s > 27.5).sum()))).reset_index()
save(day.merge(day_work, on=["location_id", "date"]).round(2), "location_daily_2025", "MODEL", "Shift means use 9am-6pm.")

# ---------------------------------------------------------------------------
# Rules and profiles
# ---------------------------------------------------------------------------
HEAT_TABLE = {"light": [(31.0, 100), (32.0, 50), (32.5, 25)],
              "moderate": [(28.0, 100), (29.0, 75), (30.0, 50), (31.5, 25)],
              "heavy": [(27.5, 75), (29.0, 50), (30.5, 25)]}


def allowed_pct(w, load):
    for limit, pct in HEAT_TABLE[load]:
        if w <= limit:
            return pct
    return 0


save(pd.DataFrame([{"workload": k, "wbgt_max_c": lim, "allowed_work_pct": p} for k, rows in HEAT_TABLE.items() for lim, p in rows]),
     "rules_heat_work_table", "RULE", "ACGIH-style screening criteria for acclimatized workers, as published by CCOHS. Above the last row the table gives no allocation.")
JOBS = {  # id: label, location, workload, condition, OSHA group, scope note
    "salt_raking": ("Salt-pan raking", "little_rann_kutch", "heavy", "sun", None, "Original job group"),
    "port_yard_kandla": ("Port yard loading, Kandla", "kandla_port", "heavy", "sun", None, "Original; cargo unknown, so no silica scenario"),
    "port_yard_mundra": ("Port yard loading, Mundra", "mundra_port", "heavy", "sun", None, "Original; cargo unknown, so no silica scenario"),
    "cement_yard": ("Cement yard loading", "abdasa_cement", "heavy", "sun", "Cement & concrete products", "Original job group"),
    "cement_walk": ("Cement plant walk-around", "abdasa_cement", "moderate", "sun", "Cement & concrete products", "Original job group"),
    "construction": ("Outdoor construction, Bhuj", "bhuj", "heavy", "sun", "Construction trades", "Original job group"),
    "stone_crushing": ("Stone crushing, Bhuj weather", "bhuj", "heavy", "sun", "Stone & other mineral", "Scope to be confirmed by the team"),
    "crane_cab": ("Crane cab, shaded, Kandla", "kandla_port", "light", "shade", None, "Original job group"),
    "truck_cab": ("Truck cab, shaded, Mundra", "mundra_port", "light", "shade", None, "Original job group"),
}
save(pd.DataFrame([{"job_id": k, "label": v[0], "location_id": v[1], "assumed_workload": v[2], "condition": v[3], "osha_group": v[4], "scope_note": v[5]} for k, v in JOBS.items()]),
     "job_profiles", "ASSUMPTION", "Workload and industry mapping are team assumptions.")
# New parameters. Only stone crushing has a published noise basis; the rest are placeholders until measured.
NOISE = {  # job: (dBA or None, basis, metric, low, high, sample size, place and year, read flag)
    "stone_crushing": (88.9, "Published 8-hour TWA, six stone-crushing factories; other studies bracket it", "Personal TWA8", 81.64, 88.9, "28 and 51 in bracket studies", "Taiwan; Chhattisgarh 2018; China 2019-20", "Read; verify Taiwan record"),
    "construction": (84.6, "Operating engineers; all trades were 81.4", "Personal full-shift", 81.4, 84.6, "82 engineers", "Washington State, about 2004", "Read"),
    "truck_cab": (86.1, "Heavy-machine operators, not truck-only; truck studies span the range", "Personal TWA8", 75.89, 93.0, "55 operators; 692 drivers; 9 trucks", "Chhattisgarh 2018; Iran 2024; Tehran 2022", "Read and abstract"),
    "crane_cab": (86.0, "One operator only; weak", "Personal TWA", 86.0, 86.0, "1", "Tehran, published 2022", "Read"),
    "port_yard_kandla": (None, "No personal value found; area readings of 90-92 dBA must not be used as a dose", "Area only", 90.0, 92.0, "Readings not reported", "Unnamed Indian port, 2024", "Read"),
    "port_yard_mundra": (None, "No personal value found; area readings of 90-92 dBA must not be used as a dose", "Area only", 90.0, 92.0, "Readings not reported", "Unnamed Indian port, 2024", "Read"),
    "cement_yard": (None, "No verified value found", None, None, None, None, None, "Abstract"),
    "cement_walk": (None, "No verified value found", None, None, None, None, None, "Abstract"),
    "salt_raking": (None, "No measurement found", None, None, None, None, None, "None"),
}
save(pd.DataFrame([{"job_id": j, "scenario_noise_dba": v[0], "basis": v[1], "metric": v[2], "low_dba": v[3], "high_dba": v[4], "sample": v[5], "place_year": v[6], "read_flag": v[7]} for j, v in NOISE.items()]),
     "job_noise_scenarios", "ASSUMPTION", "Outside values, none from Kachchh. Blank means no usable personal value; do not fill it with an area reading.")
save(pd.DataFrame([
    ("Noise dose", "I2S MEMS mic, such as INMP441", "dBA and % of daily dose", "Scenario dose % = 100 x 2^((TWA8 - 85) / 3) x hours / 9; published TWA8 values are already 8-hour normalised, so no 9/8 factor", "Dose above 100% on 30 work days", "Hearing test and ear protection", "Hearing loss", "RULE and placeholder", "85 dBA and 3 dB exchange are NIOSH; 30 days is a placeholder; the mic needs testing against a Type 2 meter"),
    ("UV dose", "GUVA-S12SD", "UV index and SED", "SED per hour = UV index x 0.9; dataset values are horizontal ambient model doses, NOT personal doses", "30 days with peak UV index of 8 or more, and 5+ years outdoors", "Yearly eye exam; eye protection", "Eye and skin problems", "Placeholder", "WHO, ICNIRP constants confirmed; 30 J/m2 ICNIRP limit is about 1.0-1.3 SED of sunlight; salt reflection only measured at Salar de Uyuni (Reuder 2007); low-cost UV sensors need per-unit calibration (Serrano 2022)"),
    ("Hydration", "TCS34725 colour sensor with cup", "Colour score 1-8", "Colour match to a urine chart validated in non-workers", "Score of 5 or more on a hot day, twice in 7 days", "Water and rest advice; sample at end of shift; red or brown urine goes to a doctor", "Dehydration", "Placeholder", "No validation found in hot-climate workers; TCS34725 not validated; vitamins and medicines can change colour; no study links colour to kidney outcomes"),
    ("Work hours", "QR or RFID check-in at the node", "Hours per week", "Check-in to check-out, summed by week", "55+ hours for 4 weeks in a row", "Long-term exposure flag; supervisor review; blood pressure check if a clinician agrees", "Heart and stroke risk", "Evidence and placeholder", "55 hours comes from WHO/ILO long-term cohort evidence; 4 weeks is unvalidated; this is a health flag, not a legal finding or a disease screen; needs worker safeguards"),
    ("Combined workload", "Heat node and check-in", "Weeks", "55+ hours and 3+ hot days in a week", "First such week", "Supervisor review", "None: exploratory only", "Untested proposal", "No study tests this rule; hours and hot days are both common, so it may fire often; carry-over heat is another hypothesis"),
], columns=["parameter", "esp32_part", "unit", "calculation", "trigger", "action", "linked_condition", "basis_type", "limits"]), "sensor_parameters", "ASSUMPTION", "New alert parameters. Triggers need clinician review. Sensors are prototypes and do not diagnose.")
save(pd.DataFrame([
    ("LAW_GJ_9", "Legal", "Factory or construction worker, State sphere, completed 45", "Annual exam due within 120 days of 1 January; Form 5", "Gujarat OSH Rules 2025, Rule 9", "In force per text read"),
    ("LAW_C_5", "Legal", "Dock or construction employee, Central sphere, completed 40", "Annual exam; Form-VIII; ESIC facilities allowed", "Central OSH Rules 2026, Rule 5", "In force per text read"),
    ("LAW_DISEASE", "Legal", "Third Schedule disease suspected or found", "Notice by employer or doctor", "Gujarat OSH Rules 2025", "Check rule number before quoting"),
    ("EXP_REVIEW", "Proposed", "Scenario cumulative silica at or above 0.5 mg/m3-years", "Referral request; never 'silicosis suspected'", "Team placeholder from published cohorts", "CLINICIAN MUST CONFIRM; show P75 and P90"),
    ("SYMPTOM", "Proposed", "Cough, breathlessness, repeated dark urine, or worker request", "Doctor review", "Team proposal", "CLINICIAN MUST CONFIRM"),
    ("HEAT_EMERGENCY", "Proposed", "Collapse or confusion in heat", "Call 108 and start cooling", "Team proposal", "CLINICIAN MUST CONFIRM"),
    ("HEAT_SPIKE", "Proposed", "Day's peak WBGT at or above that job's 2025 95th percentile", "Spike alert in addition to seasonal plan", "Team placeholder", "Tune in pilot"),
], columns=["rule_id", "type", "trigger", "action", "basis", "status"]), "rules_routing", "ASSUMPTION", "Legal rows are read from rules; proposed rows are placeholders.")
save(pd.DataFrame([
    ("Silicosis", "Silica", "Work history; chest X-ray; doctor reading; spirometry", "Core", "US silica samples; He 2022; Morbi case count"),
    ("Silico-TB and TB", "Silica raises TB risk", "Cough history; sputum test; X-ray; TB treatment status", "Core", "No TB data held"),
    ("COPD", "Dust and silica", "Symptoms; smoking; spirometry", "Core", "He 2022"),
    ("Lung cancer", "Long-term silica exposure", "Exposure and smoking history; doctor-ordered imaging", "Mention only", "Literature only"),
    ("Kidney disease", "Heat and dehydration; reported silica link", "Creatinine/eGFR; urine tests; water intake", "Core", "Salt-pan paper; Kachchh heat model"),
    ("Rheumatoid arthritis", "Reported silica link", "Joint symptoms; doctor assessment; blood tests", "Mention only", "None held"),
    ("Heat stroke and exhaustion", "Heat and workload", "Body temperature; symptoms; WBGT; job", "Core", "Kachchh heat model; no case records"),
    ("Dehydration", "Heat and limited water", "Water intake; urine colour or specific gravity", "Core", "Salt-pan paper"),
    ("Eye and skin problems", "Salt-pan glare and brine", "Eye and skin exam", "Later", "No checked dataset"),
    ("Hearing loss", "Noise", "Noise levels; audiometry", "Later", "None held"),
    ("Back and joint pain", "Heavy work", "Symptoms; job tasks", "Later", "None held"),
    ("Chemical poisoning", "Lead, benzene and others", "Process records; blood or urine tests", "Later", "Gujarat draft rules only"),
], columns=["condition", "main_link", "data_needed", "project_scope", "evidence_held"]), "condition_data_map", "ASSUMPTION", "Planning map, not medical guidance; needs clinician review.")
save(pd.DataFrame([
    ("Primary Health Centres", 64, "kachchh.nic.in District at a Glance", "Page updated 2018; check current count"),
    ("Community Health Centres", 17, "kachchh.nic.in District at a Glance", "Page updated 2018; check current count"),
    ("Civil hospitals", 3, "kachchh.nic.in District at a Glance", "Page updated 2018; check current count"),
    ("Population, Census 2011", 2092371, "kachchh.nic.in District at a Glance", "Rural 1,363,836; urban 728,535"),
], columns=["item", "value", "source", "note"]), "district_facts", "OFFICIAL", "Check age of figures before citing.")

nfhs = pd.read_csv(RAW / "nfhs5/nfhs5_districts.csv")
nfhs = nfhs[(nfhs.State == "Gujarat") & (nfhs.District == "Kachchh")]
keep = nfhs[nfhs.Indicator.str.contains("tobacco|alcohol|blood sugar|blood pressure|health insurance|anaemic", case=False)].copy()
keep["number"] = keep.Indicator.str.extract(r"^(\d+)\.").astype(float)
keep["group_from_factsheet_order"] = keep.number.map(lambda n: "Women 15+" if n in (86, 87, 88, 92, 93, 94) else ("Men 15+" if n in (89, 90, 91, 95, 96, 97) else ""))
save(keep[["number", "Indicator", "group_from_factsheet_order", "NFHS-5", "NFHS-4", "NFHS-5-note"]].rename(columns={"Indicator": "indicator", "NFHS-5": "nfhs5_pct", "NFHS-4": "nfhs4_pct", "NFHS-5-note": "note"}),
     "kachchh_nfhs5_health_indicators", "OFFICIAL", "NFHS-5 2019-21 via pratapvardhan/NFHS-5 extract. General population, not workers. Check group labels against the official Kachchh fact sheet.")

# ---------------------------------------------------------------------------
# Evidence tables
# ---------------------------------------------------------------------------
osha = pd.read_csv(REPO / "data/processed/osha_silica_personal_samples_2014_2023.csv")
osha = osha[osha.EIGHT_HR_TWA_CALC == "Y"]
save(osha[["INSPECTION_NUMBER", "industry_group", "DATE_SAMPLED", "SUBSTANCE", "result_ug_m3"]].rename(columns=str.lower), "osha_silica_8h_samples", "PUBLIC_MEASURED", "US OSHA targeted inspections, 2014-2023; 47% recorded as zero.")
rows = []
for g, s in osha.groupby("industry_group"):
    if g in ("Other", "Lime/gypsum"):
        continue
    q = s.result_ug_m3.quantile([.5, .75, .9])
    rows.append({"osha_group": g, "samples": len(s), "inspections": s.INSPECTION_NUMBER.nunique(), "pct_recorded_zero": round((s.result_ug_m3 == 0).mean() * 100),
                 "p50_ug_m3": round(q[.5], 1), "p75_ug_m3": round(q[.75], 1), "p90_ug_m3": round(q[.9], 1),
                 "sample_note": "Very small: 2 firms; do not use for routing" if len(s) < 20 else ""})
SILICA = save(pd.DataFrame(rows), "silica_scenarios", "DERIVED", "From US samples. Scenarios only; not silica measured or inhaled in Kachchh.")
cp = pd.read_csv(REPO / "data/processed/cpcb_gujarat_daily_pm.csv")
save(cp, "cpcb_gujarat_daily_pm", "PUBLIC_MEASURED", "Five Gujarat stations; none in Kachchh; outdoor air, not worker exposure.")
trace = pd.read_csv(ROOT / "simulation/output/wokwi_dust_replay_by_minute.csv")
trace["task_phase"] = pd.cut(trace.minute, [-1, 3, 19, 40], labels=["prep", "mixing", "block laying"])
save(trace, "sensor_trace_by_minute", "PUBLIC_MEASURED", "Mendeley construction experiment; 10-minute moving average; units not stated in the sheets. Use for shape, not level.")
save(pd.DataFrame([
    ("Salt-pan workers exceeding heat limit", "87.5%", "352 workers, Tamil Nadu", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398"),
    ("High post-shift urine specific gravity", "28%", "352 workers, Tamil Nadu", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398"),
    ("eGFR below 60", "7%; adjusted OR 0.9, not significant", "352 workers, Tamil Nadu", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398"),
    ("eGFR below 90, above vs below heat limit", "51.3% vs 22.7%; adjusted OR 2.9", "352 workers, Tamil Nadu", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398"),
    ("High urine specific gravity before shift", "10.1%", "352 workers, Tamil Nadu", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398"),
    ("Gujarat hours, all workers, 2023-24", "46.9 h/week; 45.6% over 48 h; 14.2% over 60 h", "PLFS tables; unofficial four-quarter means; Gujarat, not Kachchh", "https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf"),
    ("Gujarat hours, regular salaried only, 2023-24", "52.5 h/week", "PLFS Table 41; do not present as all workers", "https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf"),
    ("Gujarat share at 55+ hours", "Between about 14% and 46%", "Bound from PLFS bands; no published 55-hour band", "https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf"),
    ("Stroke incidence at 55+ vs 35-40 hours", "RR 1.35 (1.13-1.61)", "Descatha 2020, 7 studies; years of exposure", "https://stacks.cdc.gov/view/cdc/224086"),
    ("Ischaemic heart disease death at 55+ hours", "RR 1.17 (1.05-1.31)", "Li 2020; years of exposure", "https://stacks.cdc.gov/view/cdc/224086"),
    ("Salt-flat UV reflection", "Albedo 0.69; UV index about 20% higher", "Salar de Uyuni only; not Kachchh salt pans", "https://doi.org/10.1016/j.jphotobiol.2006.12.002"),
    ("UV constants", "1 UV index = 0.9 SED/h; 1 SED = 100 J/m2; ICNIRP 30 J/m2 about 1.0-1.3 SED of sunlight", "ICNIRP", "https://www.icnirp.org/cms/upload/publications/ICNIRPUVWorkersHP.pdf"),
    ("Low-cost UV sensors", "Per-unit calibration needed; slopes up to 60% apart", "Spain, 2 units per model", "https://doi.org/10.3389/fenvs.2021.737875"),
    ("Abnormal lung function odds with excess dust", "OR 2.46", "China, multi-enterprise", "https://doi.org/10.3390/ijerph191711065"),
    ("Pneumoconiosis-like changes, over 10 vs 5 or fewer years", "OR 3.32 (1.14-9.69)", "China, small case count", "https://doi.org/10.3390/ijerph191711065"),
    ("Reported occupational disease, India, 2011-16", "562 cases", "National", "https://india.un.org/en/162707-india-must-seize-opportunity-create-safe-and-healthy-workplace"),
    ("Silicosis cases identified by PTRC since 2018", "182, including 80 deaths", "Morbi and Surendranagar; case-finding count", "https://www.downtoearth.org.in/health/gujarats-silent-epidemic-silicosis-is-killing-workers-while-the-state-looks-away"),
    ("Workers' families ordered compensation for silicosis deaths", "238 deaths", "Supreme Court, Gujarat, 2016", "https://www.downtoearth.org.in/health/sc-orders-compensation-for-silicosis-patients-53852"),
    ("Heatstroke deaths counted from media reports", "At least 84, 10 in Gujarat", "India, Feb-Jul 2025; likely undercount", "https://theprint.in/india/india-recorded-at-least-84-heatstroke-deaths-in-2025-summer-study/2726866"),
    ("Work-related deaths from dust, gases and fumes", "About 450,000", "World, 2016, WHO/ILO estimate", "https://www.aiha.org/news/210923-who-and-ilo-air-pollution-among-leading-causes-of-work-related-deaths-in-2016"),
    ("Deaths linked to long working hours", "745,194", "World, 2016; modelled; 55+ hours a week (Pega 2021)", "https://richmond.web.ucu.org.uk/files/2021/07/Pega_et_al_2021_Global-regional-and-national-burdens-of-ischemic-heart-disease-and-stroke-attributable-to-exposure-to-long-working-hours.pdf"),
    ("Pterygium in brine salt workers vs comparison groups", "21.0% vs 9.1% dry-salt and 9.4% controls", "865 Indian salt workers and 304 controls; abstract only; site not named", "https://link.springer.com/doi/10.1007/s10792-006-0001-y"),
    ("Stone-crushing noise, 8-hour average", "88.9 dBA", "Six factories, Taiwan", "https://lawdata.com.tw/tw/detail.aspx?no=281514"),
    ("Noise limit and exchange rate", "85 dBA, 3 dB", "NIOSH recommended limit", "https://webarchive.library.unt.edu/eot2008/20090121082336/http:/www.cdc.gov/niosh/docs/98-126/chap2.html"),
], columns=["finding", "value", "context", "source"]), "published_evidence", "OFFICIAL", "Published findings; aggregate only, not patient records.")

# ---------------------------------------------------------------------------
# Heat by job and by locality
# ---------------------------------------------------------------------------
JOB_HOURS = {}
for job, (label, loc, load, cond, _, _) in JOBS.items():
    d = HOURLY[(HOURLY.location_id == loc) & HOURLY.hour.between(9, 17)].copy()
    d["wbgt"] = d[f"wbgt_{cond}"]
    d["pct"] = d.wbgt.map(lambda w: allowed_pct(w, load))
    JOB_HOURS[job] = d
rows = []
for job, d in JOB_HOURS.items():
    daily = d.groupby("date").agg(allowed_h=("pct", lambda s: s.sum() / 100), month=("month", "first"))
    row = {"job_id": job, "label": JOBS[job][0], "workload": JOBS[job][2], "condition": JOBS[job][3],
           "allowed_h_apr_oct": round(daily[daily.month.between(4, 10)].allowed_h.mean(), 1), "worst_month_allowed_h": round(daily.groupby("month").allowed_h.mean().min(), 1),
           "days_under_half_shift": int((daily.allowed_h < 4.5).sum())}
    for pct in (100, 75, 50, 25, 0):
        row[f"hours_at_{pct}_pct"] = int((d.pct == pct).sum())
    rows.append(row)
save(pd.DataFrame(rows), "heat_by_job_2025", "DERIVED", "Model heat with assumed workload, 9am-6pm.")
rows = []
for loc, label, taluka, kind, _ in LOCATIONS:
    d = HOURLY[(HOURLY.location_id == loc) & HOURLY.hour.between(9, 17)]
    hot = d[d.month.between(4, 10)]
    rows.append({"location_id": loc, "label": label, "taluka": taluka, "location_type": kind,
                 "heavy_sun_allowed_h_apr_oct": round(hot.wbgt_sun.map(lambda w: allowed_pct(w, "heavy")).sum() / 100 / hot.date.nunique(), 1),
                 "moderate_sun_allowed_h_apr_oct": round(hot.wbgt_sun.map(lambda w: allowed_pct(w, "moderate")).sum() / 100 / hot.date.nunique(), 1),
                 "light_shade_allowed_h_apr_oct": round(hot.wbgt_shade.map(lambda w: allowed_pct(w, "light")).sum() / 100 / hot.date.nunique(), 1),
                 "hours_sun_over_27_5": int((d.wbgt_sun > 27.5).sum()), "shift_pm10_mean": round(d.pm10.mean(), 1),
                 "days_pm10_over_100": int((HOURLY[HOURLY.location_id == loc].groupby("date").pm10.mean() > 100).sum()), "taluka_population_2011": POP[taluka]})
LOCALITY = pd.DataFrame(rows).sort_values("heavy_sun_allowed_h_apr_oct").reset_index(drop=True)
LOCALITY.insert(0, "heat_rank", LOCALITY.heavy_sun_allowed_h_apr_oct.rank(method="min").astype(int))
save(LOCALITY, "locality_heat_priority_2025", "DERIVED", "Heat ranking only. Worker counts by job are unavailable, so this is not a final outreach priority.")

# ---------------------------------------------------------------------------
# Simulation: fictional workers and scripted journeys
# ---------------------------------------------------------------------------
SPIKE = {j: d.groupby("date").wbgt.max().quantile(.95) for j, d in JOB_HOURS.items()}
WORKERS = [  # id, age on 1 Jan, sex not used, employer type, sphere, prior silica-industry years, prior job, how entered record
    ("SIM-A", 24, "Contractor", "State", 4, "stone_crushing", "Public screening", [("2025-01-01", "stone_crushing"), ("2025-07-01", "port_yard_kandla")]),
    ("SIM-B", 32, "Contractor", "State", 10, "stone_crushing", "Public screening", [("2025-01-01", "stone_crushing")]),
    ("SIM-C", 47, "Factory", "State", 20, "cement_yard", "Employer list", [("2025-01-01", "cement_yard")]),
    ("SIM-D", 38, "Contractor", "State", 12, "cement_yard", "Public screening", [("2025-01-01", "cement_yard"), ("2025-09-01", "construction")]),
    ("SIM-E", 41, "Self-employed", "None", 0, None, "Worker-volunteer", [("2025-01-01", "salt_raking"), ("2025-07-01", "construction"), ("2025-10-01", "salt_raking")]),
    ("SIM-F", 46, "Construction", "State", 15, "construction", "Employer list", [("2025-01-01", "construction")]),
    ("SIM-G", 42, "Dock", "Central", 0, None, "Employer list", [("2025-01-01", "port_yard_kandla")]),
    ("SIM-H", 35, "Transport", "State", 0, None, "Public screening", [("2025-01-01", "truck_cab")]),
]


# Designed test cohort: every job and employer pair crossed with age and tenure bands.
# This is an enumeration for testing, so its proportions say nothing about Kachchh.
COHORT_JOBS = [
    ("salt_raking", "Self-employed", "None"), ("port_yard_kandla", "Dock", "Central"), ("port_yard_mundra", "Dock", "Central"),
    ("cement_yard", "Factory", "State"), ("cement_yard", "Contractor", "State"), ("cement_walk", "Factory", "State"),
    ("construction", "Construction", "State"), ("stone_crushing", "Contractor", "State"), ("crane_cab", "Dock", "Central"), ("truck_cab", "Transport", "State"),
]
AGE_TENURE = {25: (2, 4, 7), 35: (3, 10, 17), 42: (3, 12, 24), 47: (5, 15, 29)}
MOVE_TO = {"port_yard_kandla": "truck_cab", "port_yard_mundra": "truck_cab", "cement_yard": "construction", "cement_walk": "cement_yard",
           "construction": "stone_crushing", "stone_crushing": "port_yard_kandla", "crane_cab": "port_yard_kandla", "truck_cab": "port_yard_mundra"}
DESIGN = {}
n = 0
for job, employer, sphere in COHORT_JOBS:
    for age, tenures in AGE_TENURE.items():
        for years in tenures:
            n += 1
            wid = f"SIM-W{n:03d}"
            if job == "salt_raking":
                assignments = [("2025-01-01", job), ("2025-07-01", "construction"), ("2025-10-01", job)]
            elif n % 4 == 1:
                assignments = [("2025-01-01", job), ("2025-07-01", MOVE_TO[job])]
            else:
                assignments = [("2025-01-01", job)]
            entry = "Worker-volunteer" if job == "salt_raking" else ("Employer list" if employer in ("Factory", "Construction", "Dock") else "Public screening")
            WORKERS.append((wid, age, employer, sphere, years if JOBS[job][4] else 0, job if JOBS[job][4] else None, entry, assignments))
            DESIGN[wid] = {"n": n, "job": job, "moved": n % 4 == 1 and job != "salt_raking", "tenure": years}
JOB_DAY = {job: {d: g for d, g in frame.groupby("date")} for job, frame in JOB_HOURS.items()}


def legal_due(age, employer, sphere):
    if sphere == "State" and employer in ("Factory", "Construction") and age >= 45:
        return "Gujarat Rule 9"
    if sphere == "Central" and employer in ("Dock", "Construction") and age >= 40:
        return "Central Rule 5"
    return ""


def conc(job, pct_col):
    group = JOBS[job][4] if job else None
    if not group:
        return 0.0
    return float(SILICA.loc[SILICA.osha_group == group, pct_col].iloc[0])


def job_on(assignments, d):
    current = assignments[0][1]
    for start, job in assignments:
        if d >= date.fromisoformat(start):
            current = job
    return current


days = [date(YEAR, 1, 1) + timedelta(n) for n in range(365)]
WORKDAYS = sum(1 for d in days if d.weekday() != 6)
worker_rows, assign_rows, exposure_rows, alert_rows = [], [], [], []
crossing = {}
NARRATIVE_TENURE = {"SIM-A": 4, "SIM-B": 10, "SIM-C": 20, "SIM-D": 12, "SIM-E": 20, "SIM-F": 15, "SIM-G": 18, "SIM-H": 10}
NARRATIVE_OVERTIME = {"SIM-F", "SIM-G"}
NARRATIVE_LOW_WATER = {"SIM-E"}
param_triggers = {}


def weekly_key(d):
    iso = d.isocalendar()
    return (iso[0], iso[1])
for wid, age, employer, sphere, prior_y, prior_job, entry, assignments in WORKERS:
    worker_rows.append({"worker_id": wid, "label": SCENARIO, "cohort": "designed_test" if wid in DESIGN else "narrative", "age_on_1_jan_2025": age, "employer_type": employer, "legal_sphere": sphere,
                        "years_in_silica_industry_before_2025": prior_y, "prior_job_id": prior_job, "entered_record_via": entry, "legal_rule_applying": legal_due(age, employer, sphere)})
    for i, (start, job) in enumerate(assignments):
        end = date.fromisoformat(assignments[i + 1][0]) - timedelta(1) if i + 1 < len(assignments) else date(YEAR, 12, 31)
        assign_rows.append({"worker_id": wid, "job_id": job, "location_id": JOBS[job][1], "taluka": next(l[2] for l in LOCATIONS if l[0] == JOBS[job][1]), "start_date": start, "end_date": str(end)})
    p75 = prior_y * conc(prior_job, "p75_ug_m3") / 1000
    p90 = prior_y * conc(prior_job, "p90_ug_m3") / 1000
    pm_dose = 0.0
    tenure = DESIGN[wid]["tenure"] if wid in DESIGN else NARRATIVE_TENURE[wid]
    # Fixed design patterns, chosen to exercise each path. Not evidence of real rates.
    overtime = (DESIGN[wid]["n"] % 3 == 0) if wid in DESIGN else wid in NARRATIVE_OVERTIME
    low_water = (DESIGN[wid]["n"] % 6 == 0) if wid in DESIGN else wid in NARRATIVE_LOW_WATER
    noise_days = high_uv_days = 0
    dark_hot_days, week_hours, week_hot, hours_run = [], {}, {}, []
    triggers = {}
    for d in days:
        if d.weekday() == 6:
            continue
        job = job_on(assignments, d)
        s = JOB_DAY[job][d]
        p75 += conc(job, "p75_ug_m3") / 1000 / WORKDAYS
        p90 += conc(job, "p90_ug_m3") / 1000 / WORKDAYS
        pm_dose += s.pm2_5.sum() / 1000
        for label, val in (("p75", p75), ("p90", p90)):
            if val >= 0.5 and (wid, label) not in crossing:
                crossing[(wid, label)] = d
        allowed = s.pct.sum() / 100
        spike = s.wbgt.max() >= SPIKE[job]
        hours_worked = 11.0 if overtime and d.month in (3, 4, 5, 6) else 9.0
        noise = NOISE[job][0]
        # Published TWA8 is treated as a normal 9-hour shift here; overtime scales it. Blank means no dose.
        noise_dose = 100 * 2 ** ((noise - 85) / 3) * hours_worked / 9 if noise is not None else None
        outdoors = JOBS[job][3] == "sun"
        uv_peak = float(s.uv_index.max()) if outdoors else 0.0
        uv_sed = float(s.uv_index.sum()) * 0.9 if outdoors else 0.0
        hot = bool(outdoors and s.wbgt.max() >= 30)
        colour = (6 if low_water else 4) if hot else 3
        if noise_dose is not None and noise_dose > 100:
            noise_days += 1
            if noise_days == 30:
                triggers["noise"] = d
        if uv_peak >= 8:
            high_uv_days += 1
            if high_uv_days == 30 and tenure >= 5:
                triggers["uv"] = d
        if hot and colour >= 5:
            dark_hot_days = [x for x in dark_hot_days if (d - x).days < 7] + [d]
            if len(dark_hot_days) >= 2 and "hydration" not in triggers:
                triggers["hydration"] = d
        key = weekly_key(d)
        week_hours[key] = week_hours.get(key, 0) + hours_worked
        week_hot[key] = week_hot.get(key, 0) + int(hot)
        if d.weekday() == 5:
            hours_run = hours_run + [week_hours[key]] if week_hours[key] >= 55 else []
            if len(hours_run) == 4 and "hours" not in triggers:
                triggers["hours"] = d
            if week_hours[key] >= 55 and week_hot[key] >= 3 and "combined" not in triggers:
                triggers["combined"] = d
        exposure_rows.append({"worker_id": wid, "shift_date": str(d), "job_id": job, "site_id": JOBS[job][1], "shift_duration_hours": hours_worked,
                              "noise_dba_scenario": noise, "noise_dose_pct": round(noise_dose, 1) if noise_dose is not None else None, "uv_peak_index": round(uv_peak, 1), "uv_dose_sed": round(uv_sed, 1), "urine_colour_score_scripted": colour,
                              "avg_pm2_5_ug_m3": round(s.pm2_5.mean(), 1), "peak_pm2_5_ug_m3": round(s.pm2_5.max(), 1), "avg_pm10_ug_m3": round(s.pm10.mean(), 1),
                              "cumulative_dust_dose_mg_m3_hr": round(pm_dose, 3), "avg_wbgt_c": round(s.wbgt.mean(), 2), "max_wbgt_c": round(s.wbgt.max(), 2),
                              "hours_above_wbgt_28": int((s.wbgt > 28).sum()), "hours_above_wbgt_30": int((s.wbgt > 30).sum()), "allowed_work_hours": round(allowed, 2),
                              "silica_cum_p75_mg_m3_yr": round(p75, 3), "silica_cum_p90_mg_m3_yr": round(p90, 3), "flag_over_exposure": bool(spike), "flag_reason": "Heat spike day" if spike else ""})
        if spike:
            alert_rows.append({"worker_id": wid, "date": str(d), "job_id": job, "alert_type": "HEAT_SPIKE", "peak_wbgt_c": round(s.wbgt.max(), 1), "allowed_work_hours": round(allowed, 1),
                               "message": f"Unusually hot day for {JOBS[job][0]}: take shade, water and rest breaks; about {allowed:.1f} work hours advised."})
    param_triggers[wid] = triggers
    for name, d in triggers.items():
        alert_rows.append({"worker_id": wid, "date": str(d), "job_id": job_on(assignments, d), "alert_type": f"{name.upper()}_TRIGGER", "peak_wbgt_c": None, "allowed_work_hours": None,
                           "message": {"noise": "Noise dose has been high for 30 work days: hearing test due.", "uv": "High UV for 30 days with 5+ years outdoors: yearly eye exam due.",
                                       "hydration": "Dark urine on hot days twice in a week: drink water, rest, and see the clinic if it continues.", "hours": "55+ hours a week for 4 weeks: blood pressure check and supervisor review.",
                                       "combined": "Long hours and repeated hot days this week: supervisor review."}[name]})
save(pd.DataFrame([{"worker_id": w, "parameter": k, "trigger_date": str(v)} for w, t in param_triggers.items() for k, v in t.items()]), "sim_parameter_triggers", "FICTIONAL", "When each new parameter first triggered. Thresholds are placeholders.", SIM)
save(pd.DataFrame(worker_rows), "sim_workers", "FICTIONAL", "8 narrative workers plus 120 designed test workers (job by employer by age by tenure). Not a population sample.", SIM)
save(pd.DataFrame(assign_rows), "sim_worker_assignments", "FICTIONAL", "Shows movement from one job or site to another (A to B).", SIM)
EXP = save(pd.DataFrame(exposure_rows), "sim_daily_exposure", "FICTIONAL", "Fictional people on model heat, modelled outdoor dust and US silica scenarios. uv_dose_sed is a horizontal ambient model dose, not a personal dose. cumulative_dust_dose is outdoor PM2.5 only; never use it as a silica trigger. Sundays off and a 9-hour shift are assumptions.", SIM)
save(pd.DataFrame(alert_rows), "sim_alerts", "FICTIONAL", "Spike threshold is a placeholder.", SIM)

JOURNEYS = {
    "SIM-A": [("2025-02-10", "ENROLLED", "Public screening; not on any register"), ("2025-02-10", "REFERRED", "Exposure review requested"), ("2025-03-05", "ATTENDED", "Clinic attendance recorded"), ("2025-03-05", "CLOSED", "No follow-up advised"), ("2025-07-01", "JOB_CHANGE", "Moved to Kandla; record stays with worker")],
    "SIM-B": [("2025-02-17", "ENROLLED", "Public screening"), ("2025-02-17", "REFERRED", "Exposure review requested"), ("2025-03-04", "SYMPTOM_REPORTED", "Cough reported; doctor review prioritised"), ("2025-03-20", "ATTENDED", "Doctor review recorded"), ("2025-03-20", "FOLLOW_UP_ADVISED", "Doctor advised follow-up"), ("2025-04-10", "FOLLOW_UP_MISSED", "Reminder sent"), ("2025-04-25", "FOLLOW_UP_DONE", "Follow-up recorded"), ("2025-04-25", "CLOSED", "Closed by clinic")],
    "SIM-C": [("2025-01-01", "LEGAL_EXAM_DUE", "Rule 9 window to 30 April"), ("2025-03-12", "ATTENDED", "Form 5 exam recorded"), ("2025-03-12", "CLOSED", "Certificate copy held by worker")],
    "SIM-D": [("2025-06-10", "ENROLLED", "Public screening"), ("2025-06-10", "REFERRED", "Exposure review requested"), ("2025-09-01", "JOB_CHANGE", "Moved to Bhuj before attending"), ("2025-09-20", "ATTENDED", "Attendance recorded at new location"), ("2025-09-20", "CLOSED", "No follow-up advised")],
    "SIM-E": [("2025-04-14", "ENROLLED", "Worker-volunteer at salt pan"), ("2025-05-20", "SYMPTOM_REPORTED", "Repeated dark urine reported"), ("2025-05-28", "ATTENDED", "Doctor review recorded"), ("2025-05-28", "FOLLOW_UP_ADVISED", "Doctor advised follow-up"), ("2025-07-01", "LOST_TO_FOLLOW_UP", "Left salt pan for off-season work"), ("2025-08-20", "RE_FOUND", "Scanned QR card at a Bhuj check-up"), ("2025-08-20", "FOLLOW_UP_DONE", "Follow-up recorded"), ("2025-08-20", "CLOSED", "Closed by clinic")],
    "SIM-F": [("2025-01-01", "LEGAL_EXAM_DUE", "Rule 9 window to 30 April"), ("2025-05-01", "OVERDUE", "Exam not recorded by deadline"), ("2025-05-22", "ATTENDED", "Late Form 5 exam recorded"), ("2025-05-22", "CLOSED", "Certificate copy held by worker")],
    "SIM-G": [("2025-01-01", "LEGAL_EXAM_DUE", "Central Rule 5 annual exam"), ("2025-05-01", "OVERDUE", "Follow-up target date passed; central rule sets no 120-day window"), ("2025-12-31", "STILL_OPEN", "Case still open at year end")],
    "SIM-H": [("2025-03-03", "ENROLLED", "Public screening"), ("2025-03-03", "NO_REFERRAL", "Heat advice given; no legal or exposure route")],
}
# ---------------------------------------------------------------------------
# Condition tracking
# ---------------------------------------------------------------------------
DUST_JOBS = {"stone_crushing", "cement_yard", "cement_walk", "construction"}
HEAT_JOBS = {j for j, v in JOBS.items() if v[3] == "sun"}
HEAVY_JOBS = {j for j, v in JOBS.items() if v[2] == "heavy"}
CONDITIONS = [
    # condition, relevant jobs, how it is triggered, what the doctor records, tracking level
    ("Silicosis", DUST_JOBS, "Past or current dust-job exposure; respiratory symptoms; legal exam", "Chest X-ray reading; spirometry; doctor outcome", "Active"),
    ("TB and silico-TB", DUST_JOBS, "Persistent cough or weight loss", "Sputum test; X-ray; TB referral status", "Active"),
    ("COPD", DUST_JOBS, "Cough or breathlessness; dust job; smoking history", "Spirometry; doctor outcome", "Active"),
    ("Kidney disease", HEAT_JOBS, "Reported symptoms; legal exam creatinine; red or brown urine goes to a doctor. Colour score alone does not trigger this", "Creatinine/eGFR; urine test; doctor outcome", "Active"),
    ("Heat illness", HEAT_JOBS, "Heat spike days; dizziness, cramps or collapse", "Heat event; body temperature; emergency referral", "Active"),
    ("Dehydration", HEAT_JOBS, "Colour score of 5+ on hot days twice in 7 days; dark urine; low water intake", "Urine colour or specific gravity; advice given", "Active"),
    ("Eye and skin problems", HEAT_JOBS, "High UV on 30 days with 5+ years outdoors; glare or brine symptoms", "Eye and skin exam outcome", "Active"),
    ("Back and joint pain", HEAVY_JOBS, "Worker-reported pain in heavy work", "Doctor outcome; work advice", "Active"),
    ("Lung cancer", DUST_JOBS, "Not screened by this system; doctor may note it", "Doctor-entered diagnosis only", "Doctor-entered only"),
    ("Rheumatoid arthritis", DUST_JOBS, "Not screened by this system; doctor may note it", "Doctor-entered diagnosis only", "Doctor-entered only"),
    ("Hearing loss", set(JOBS), "Noise dose above 100% on 30 work days; jobs without a noise value show NO_NOISE_DATA", "Audiometry; doctor outcome", "Active"),
    ("Heart and stroke risk", set(JOBS), "55+ hours a week for 4 weeks, as a long-term exposure flag", "Blood pressure; doctor outcome", "Active"),
    ("Chemical poisoning", set(), "Needs chemical process records; no chemical jobs in this cohort", "Process-specific blood or urine tests", "Later: out of scope"),
]
save(pd.DataFrame([{"condition": c, "relevant_jobs": "; ".join(sorted(j)) or "None in cohort", "trigger": t, "doctor_records": r, "tracking_level": l} for c, j, t, r, l in CONDITIONS]),
     "condition_tracking_rules", "ASSUMPTION", "How each condition is tracked. Needs clinician review. The system never diagnoses.", TABLES)

RANK = dict(zip(LOCALITY.location_id, LOCALITY.heat_rank))
symptom_rows, condition_rows = [], []
for wid, age, employer, sphere, prior_y, prior_job, entry, assignments in WORKERS:
    if wid not in DESIGN:
        continue
    i = DESIGN[wid]["n"]
    job = DESIGN[wid]["job"]
    loc = JOBS[job][1]
    legal = legal_due(age, employer, sphere)
    crossed = crossing.get((wid, "p90"))
    # Fixed design pattern so each path is exercised. These shares are not evidence.
    symptoms = []
    if i % 5 == 0 and job in DUST_JOBS:
        symptoms.append(("Respiratory", "Cough or breathlessness reported", ["Silicosis", "TB and silico-TB", "COPD"]))
    if i % 6 == 0 and job in HEAT_JOBS:
        symptoms.append(("Dark urine", "Repeated dark urine reported", ["Kidney disease", "Dehydration"]))
    if i % 7 == 0 and job in HEAVY_JOBS:
        symptoms.append(("Back or joint pain", "Pain with heavy work reported", ["Back and joint pain"]))
    if i % 4 == 0 and job == "salt_raking":
        symptoms.append(("Eye or skin", "Glare or brine symptoms reported", ["Eye and skin problems"]))
    if i % 9 == 0 and job in HEAT_JOBS:
        symptoms.append(("Heat symptoms", "Dizziness or cramps at work", ["Heat illness", "Dehydration"]))
    enrol = date(2025, 1, 1) if entry == "Employer list" else date(2025, 2, 1) + timedelta(days=int(RANK[loc]) * 7)
    js = [(str(enrol), "LEGAL_EXAM_DUE" if legal else "ENROLLED", f"Entered through {entry.lower()}")]
    triggered = set()
    if legal:
        triggered.update({"Silicosis", "Kidney disease"} if job in DUST_JOBS else {"Kidney disease"})
    symptom_day = enrol + timedelta(days=14 + i % 10)
    for name, detail, conds in symptoms:
        symptom_rows.append({"worker_id": wid, "date": str(symptom_day), "symptom_group": name, "detail": detail, "scripted": True})
        js.append((str(symptom_day), "SYMPTOM_REPORTED", detail))
        triggered.update(conds)
    if crossed is not None:
        triggered.add("Silicosis")
    route_start = max([enrol] + ([crossed] if crossed else []) + ([symptom_day] if symptoms else []))
    if DESIGN[wid]["moved"]:
        js.append(("2025-07-01", "JOB_CHANGE", f"Moved to {JOBS[assignments[1][1]][0]}; record stays with worker"))
    if job == "salt_raking":
        js += [("2025-07-01", "JOB_CHANGE", "Off-season construction work in Bhuj"), ("2025-10-01", "JOB_CHANGE", "Returned to salt pan")]
    outcome = "NO_ROUTE"
    last = ""
    if triggered or legal:
        if not legal:
            js.append((str(route_start), "REFERRED", "Referral request sent"))
        attend = route_start + timedelta(days=21)
        if legal and attend < date(2025, 3, 1):
            attend = date(2025, 3, 1) + timedelta(days=i % 28)
        if i % 10 == 0:
            js.append((str(route_start + timedelta(days=60)), "LOST_TO_FOLLOW_UP", "No attendance recorded"))
            outcome, last = "LOST_TO_FOLLOW_UP", "LOST_TO_FOLLOW_UP"
        else:
            if i % 10 == 1:
                attend = (date(2025, 5, 10) if legal else attend + timedelta(days=45)) + timedelta(days=i % 15)
                js.append((str(attend - timedelta(days=9)), "OVERDUE", "Attendance overdue; reminder sent"))
            js.append((str(attend), "ATTENDED", "Attendance recorded by clinic"))
            if i % 20 == 3:
                outcome = "CONDITION_NOTED_DEMO"
            elif i % 4 == 0:
                outcome = "FOLLOW_UP_ADVISED"
            else:
                outcome = "NO_CONDITION_NOTED"
            if outcome == "NO_CONDITION_NOTED":
                js.append((str(attend), "CLOSED", "Doctor noted nothing further"))
            elif i % 8 == 0:
                js.append((str(attend), "FOLLOW_UP_ADVISED", "Doctor advised follow-up"))
                js.append(("2025-12-31", "STILL_OPEN", "Follow-up not yet recorded"))
                outcome = "FOLLOW_UP_OPEN"
            else:
                js.append((str(attend), "FOLLOW_UP_ADVISED", "Doctor advised follow-up"))
                js.append((str(attend + timedelta(days=30)), "FOLLOW_UP_DONE", "Follow-up recorded"))
                js.append((str(attend + timedelta(days=30)), "CLOSED", "Closed by clinic"))
    else:
        js.append((str(enrol), "NO_REFERRAL", "Advice given; no route triggered"))
    # New parameters raise their own check, separate from the first referral.
    param_status = {}
    links = {"noise": ["Hearing loss"], "uv": ["Eye and skin problems"], "hydration": ["Dehydration"], "hours": ["Heart and stroke risk"], "combined": []}
    for name, when in param_triggers[wid].items():
        js.append((str(when), "PARAMETER_TRIGGER", f"{name} threshold reached (placeholder rule)"))
        pattern = (i // 3 + len(name)) % 3  # Division keeps overtime and low-water workers from all sharing one outcome.
        status = {0: "CHECK_DUE", 1: "CHECKED_NOTHING_NOTED", 2: "CHECK_MISSED"}[pattern]
        if pattern == 1:
            js.append((str(when + timedelta(days=21)), "PARAMETER_CHECK_DONE", f"{name} check recorded by clinic"))
        elif pattern == 2:
            js.append((str(when + timedelta(days=60)), "PARAMETER_CHECK_MISSED", f"{name} check not recorded"))
        for c in links[name]:
            param_status.setdefault(c, status)
    JOURNEYS[wid] = sorted(js, key=lambda x: x[0])
    for condition, jobs, _, _, level in CONDITIONS:
        current_jobs = {a[1] for a in assignments}
        relevant = bool(current_jobs & jobs)
        if condition == "Hearing loss" and all(NOISE[j][0] is None for j in current_jobs):
            status = "NO_NOISE_DATA"
        elif not relevant:
            status = "NOT_RELEVANT_TO_JOB"
        elif level != "Active":
            status = "NOT_TRACKED_YET" if level.startswith("Later") else "DOCTOR_ENTERED_ONLY"
        elif condition in param_status and condition not in triggered:
            status = param_status[condition]
        elif condition in triggered:
            status = {"LOST_TO_FOLLOW_UP": "CHECK_MISSED", "NO_CONDITION_NOTED": "CHECKED_NOTHING_NOTED", "FOLLOW_UP_ADVISED": "CHECKED_FOLLOW_UP_DONE",
                      "FOLLOW_UP_OPEN": "CHECKED_FOLLOW_UP_OPEN", "CONDITION_NOTED_DEMO": "CONDITION_NOTED_DEMO"}.get(outcome, "CHECK_DUE")
        else:
            status = "WATCH_NO_TRIGGER"
        condition_rows.append({"worker_id": wid, "condition": condition, "relevant_to_job": relevant, "status": status, "demo_only": True})

NARRATIVE_CONDITIONS = {  # Triggered conditions and final status, matching each scripted journey.
    "SIM-A": ({"Silicosis"}, "CHECKED_NOTHING_NOTED"),
    "SIM-B": ({"Silicosis", "TB and silico-TB", "COPD"}, "CHECKED_FOLLOW_UP_DONE"),
    "SIM-C": ({"Silicosis", "Kidney disease"}, "CHECKED_NOTHING_NOTED"),
    "SIM-D": ({"Silicosis"}, "CHECKED_NOTHING_NOTED"),
    "SIM-E": ({"Kidney disease", "Dehydration"}, "CHECKED_FOLLOW_UP_DONE"),
    "SIM-F": ({"Silicosis", "Kidney disease"}, "CHECKED_NOTHING_NOTED"),
    "SIM-G": ({"Kidney disease"}, "CHECK_DUE"),
    "SIM-H": (set(), "CHECK_DUE"),
}
for wid, (triggered, final_status) in NARRATIVE_CONDITIONS.items():
    current_jobs = {a["job_id"] for a in assign_rows if a["worker_id"] == wid}
    links = {"noise": ["Hearing loss"], "uv": ["Eye and skin problems"], "hydration": ["Dehydration"], "hours": ["Heart and stroke risk"], "combined": []}
    open_checks = {c for name in param_triggers[wid] for c in links[name]}
    JOURNEYS[wid] = sorted(JOURNEYS[wid] + [(str(w), "PARAMETER_TRIGGER", f"{k} threshold reached (placeholder rule)") for k, w in param_triggers[wid].items()], key=lambda x: x[0])
    for condition, jobs, _, _, level in CONDITIONS:
        relevant = bool(current_jobs & jobs)
        if condition == "Hearing loss" and all(NOISE[j][0] is None for j in current_jobs):
            status = "NO_NOISE_DATA"
        elif not relevant:
            status = "NOT_RELEVANT_TO_JOB"
        elif level != "Active":
            status = "NOT_TRACKED_YET" if level.startswith("Later") else "DOCTOR_ENTERED_ONLY"
        elif condition in open_checks and condition not in triggered:
            status = "CHECK_DUE"
        else:
            status = final_status if condition in triggered else "WATCH_NO_TRIGGER"
        condition_rows.append({"worker_id": wid, "condition": condition, "relevant_to_job": relevant, "status": status, "demo_only": True})

COND = save(pd.DataFrame(condition_rows), "sim_worker_condition_status", "FICTIONAL", "Status for each condition and designed test worker at the end of 2025. Status only, with no test values. CONDITION_NOTED_DEMO is scripted, not a disease finding.", SIM)
save(pd.DataFrame(symptom_rows), "sim_symptom_reports", "FICTIONAL", "Assigned by a fixed design pattern to exercise each path. Not symptom rates.", SIM)
SUMMARY = COND.pivot_table(index="condition", columns="status", values="worker_id", aggfunc="count", fill_value=0).reset_index()
save(SUMMARY, "sim_condition_summary", "FICTIONAL", "Counts from a designed test cohort. Never present them as prevalence.", SIM)

events = [{"worker_id": w, "date": d, "event": e, "detail": t, "scripted": True} for w, js in JOURNEYS.items() for d, e, t in js]
for (w, label), d in sorted(crossing.items()):
    events.append({"worker_id": w, "date": str(d), "event": f"SILICA_SCENARIO_{label.upper()}_REACHED_0_5", "detail": "Placeholder threshold; scenario only", "scripted": False})
EV = pd.DataFrame(events).sort_values(["worker_id", "date"]).reset_index(drop=True)
save(EV, "sim_case_events", "FICTIONAL", "Scripted journeys with status only. Contains no clinical values by design.", SIM)
last = EV[EV.scripted].groupby("worker_id").tail(1)[["worker_id", "event", "date"]].rename(columns={"event": "last_status", "date": "last_status_date"})
routes = []
for w in worker_rows:
    wid = w["worker_id"]
    e = EXP[EXP.worker_id == wid].iloc[-1]
    routes.append({"worker_id": wid, "legal_route": w["legal_rule_applying"], "p75_reaches_0_5_by": str(crossing.get((wid, "p75"), "not in 2025")), "p90_reaches_0_5_by": str(crossing.get((wid, "p90"), "not in 2025")),
                   "silica_cum_p75_end_2025": e.silica_cum_p75_mg_m3_yr, "silica_cum_p90_end_2025": e.silica_cum_p90_mg_m3_yr, "spike_alerts_2025": sum(1 for a in alert_rows if a["worker_id"] == wid),
                   "mean_allowed_h_apr_oct": round(EXP[(EXP.worker_id == wid) & (pd.to_datetime(EXP.shift_date).dt.month.between(4, 10))].allowed_work_hours.mean(), 1)})
SUM = pd.DataFrame(routes).merge(last, on="worker_id")
save(SUM, "sim_worker_summary", "FICTIONAL", "One row per fictional worker for dashboard cards.", SIM)

# Route test matrix: enumerated cases, not a population sample.
grid = []
for job in JOBS:
    for age in (25, 35, 42, 47):
        for years in (2, 8, 15):
            for employer, sphere in (("Factory", "State"), ("Construction", "State"), ("Contractor", "State"), ("Self-employed", "None"), ("Dock", "Central")):
                p75 = years * conc(job, "p75_ug_m3") / 1000
                p90 = years * conc(job, "p90_ug_m3") / 1000
                grid.append({"job_id": job, "age": age, "years_in_job": years, "employer_type": employer, "legal_route": legal_due(age, employer, sphere), "exposure_review_p75": p75 >= .5, "exposure_review_p90": p90 >= .5, "has_silica_scenario": JOBS[job][4] is not None})
save(pd.DataFrame(grid), "route_test_matrix", "FICTIONAL", "Enumerated test cases for the rule engine. Counts say nothing about Kachchh.", SIM)

# ---------------------------------------------------------------------------
# Downloaded public data
# ---------------------------------------------------------------------------
import public_summaries as public  # noqa: E402

save(public.msha_noise(), "msha_noise_by_commodity_job", "PUBLIC_MEASURED", "US non-coal mine personal noise, shifts of 6-12 hours. TWA derived from PEL dose using MSHA's 5 dB rule, so do NOT feed into the 3 dB dose. The file is 99.8% coal, and no cement samples matched.")
SIL = save(public.msha_silica(), "msha_silica_by_commodity_job", "DERIVED", "US mine inspections. Dust is reported; silica is derived from the limit formula E = 10 / (%quartz + 2). Not Kachchh; not used in routing.")
save(public.niosh_noise(), "niosh_hhe_noise_personal", "PUBLIC_MEASURED", "US NIOSH health hazard evaluations. niosh_rel_dba uses the 3 dB exchange rate. Not a random sample.")
hours_lost, outdoor = public.lancet_india()
save(hours_lost, "lancet_india_hours_lost", "MODEL", "Lancet Countdown 2026, India, modelled. Units not labelled in the CSV; about thousands of hours per researcher check.")
save(outdoor, "lancet_india_outdoor_workers", "MODEL", "Lancet Countdown 2026, India, modelled.")
save(public.ilostat("hours_mean_by_activity"), "ilostat_india_hours_by_activity", "OFFICIAL", "ILOSTAT mean weekly hours. Levels conflict with PLFS, so use for ranking only.")
save(public.ilostat("hours_mean_by_occupation"), "ilostat_india_hours_by_occupation", "OFFICIAL", "ILOSTAT mean weekly hours. Levels conflict with PLFS, so use for ranking only.")
save(public.ilostat("hours_bands_EMP_TEMP_SEX_HOW"), "ilostat_india_hours_bands", "OFFICIAL", "ILOSTAT employment counts by hours band.")
t41, t43 = public.plfs_gujarat()
assert len(t41) == 36 and len(t43) == 36
save(t41, "plfs_gujarat_table41_hours", "OFFICIAL", "PLFS 2023-24 Table 41, Gujarat panels, spot-checked against the MoSPI PDF.")
save(t43, "plfs_gujarat_table43_bands", "OFFICIAL", "PLFS 2023-24 Table 43, Gujarat panels. The >48, >60 and >72 columns are derived sums.")
save(public.source_register(), "public_source_register", "OFFICIAL", "Every public source found, where it is, and whether it is in the database.")
save(pd.DataFrame([
    ("Applied", "N1-N9", "Noise table expanded; sourced values replace placeholders; cement, port and salt personal noise left blank; dose handles blanks"),
    ("Applied", "N10", "Hearing loss now covers all jobs; jobs with no noise value show NO_NOISE_DATA"),
    ("Applied", "U1, U5", "UV labelled as ambient model dose; UV evidence added"),
    ("Applied", "H1, H3, H4", "Colour stays scripted; colour linked to dehydration only; hydration evidence and caveats added"),
    ("Applied", "W2, W3, W4", "Official Gujarat hours and primary risk figures added; 55+ hours reworded as a long-term health flag"),
    ("Applied", "C1", "Combined rule marked exploratory; link to heart and stroke removed"),
    ("Not applied", "N11, N12", "Awaiting your choice: extra hearing evidence and sensor note; one figure still needs checking"),
    ("Not applied", "U2, U3, U4", "Awaiting your choice: adds assumptions; brine work and eye intervals need confirming"),
    ("Not applied", "H2", "Needs the hydration script rewritten first"),
    ("Not applied", "W1", "Needs new assumptions and a sex field"),
    ("Added", "Public data", "MSHA, NIOSH, Lancet Countdown, ILOSTAT and PLFS tables, plus a source register"),
], columns=["status", "ids", "summary"]), "change_log_v2", "RULE", "What changed from version 1. Version 1 is kept in archive_v1.")

# ---------------------------------------------------------------------------
# Finish
# ---------------------------------------------------------------------------
pd.DataFrame(DICTIONARY).to_csv(HERE / "data_dictionary.csv", index=False)
db = HERE / "ps000109_final.db"
db.unlink(missing_ok=True)
with sqlite3.connect(db) as con:
    for item in DICTIONARY:
        pd.read_csv(HERE / item["folder"] / f"{item['table']}.csv").to_sql(item["table"], con, index=False)
    pd.DataFrame(DICTIONARY).to_sql("data_dictionary", con, index=False)

pd.set_option("display.width", 250, "display.max_columns", 30, "display.max_colwidth", 44)
print("WBGT method check, max difference (sun, shade):", WBGT_CHECK)
print(pd.DataFrame(DICTIONARY)[["table", "rows", "data_class"]].to_string(index=False))
print("\nLOCALITY\n", LOCALITY[["heat_rank", "label", "taluka", "heavy_sun_allowed_h_apr_oct", "moderate_sun_allowed_h_apr_oct", "hours_sun_over_27_5", "shift_pm10_mean", "days_pm10_over_100", "taluka_population_2011"]].to_string(index=False))
print("\nWORKERS\n", SUM.to_string(index=False))
pt = pd.DataFrame([{"worker_id": w, "parameter": k} for w, t in param_triggers.items() for k in t])
print("\nPARAMETER TRIGGERS (of", len(worker_rows), "fictional workers)\n", pt.parameter.value_counts().to_string())
print("\nBY JOB, mean daily values\n", EXP.groupby("job_id")[["noise_dose_pct", "uv_peak_index", "uv_dose_sed", "shift_duration_hours"]].mean().round(1).to_string())
print("\nCONDITIONS\n", SUMMARY.to_string(index=False))
print("\nEVENT TYPES\n", EV.event.value_counts().to_string())
moves = pd.DataFrame(assign_rows).groupby("worker_id").size()
print("\nCOHORT", len(worker_rows), "| legal route", sum(1 for w in worker_rows if w["legal_rule_applying"]), "| changed job or site", int((moves > 1).sum()))
print("\nmax sim WBGT", EXP.max_wbgt_c.max(), "| clinical columns in events:", [c for c in EV.columns if c in ("creatinine", "fev1")])
print("db MB", round(db.stat().st_size / 1e6, 1))
