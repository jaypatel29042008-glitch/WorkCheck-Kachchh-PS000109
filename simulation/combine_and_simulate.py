"""Combine PS000109 public datasets into deterministic scenario outputs.

No random numbers are used. Nothing here is a measurement of a Kachchh worker.
Run: python3 combine_and_simulate.py
"""
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent / "sfic-ps000109"
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)

# ACGIH-style screening criteria for acclimatized workers, as published by CCOHS.
# Each row is (maximum WBGT in deg C, maximum fraction of time spent working).
# Beyond the last row the table gives no work allocation, so we use 0.
TABLE = {
    "light": [(31.0, 1.00), (31.0, 0.75), (32.0, 0.50), (32.5, 0.25)],
    "moderate": [(28.0, 1.00), (29.0, 0.75), (30.0, 0.50), (31.5, 0.25)],
    "heavy": [(27.5, 0.75), (29.0, 0.50), (30.5, 0.25)],
}
LEVEL = {1.00: "100% work", 0.75: "75% work", 0.50: "50% work", 0.25: "25% work", 0.00: "Beyond table"}

# Job, model location, workload (our assumption), sun or shade WBGT column, OSHA group.
JOBS = [
    ("Salt-pan raking", "little_rann_kutch", "heavy", "wbgt_sun", None),
    ("Port yard loading (Kandla)", "kandla_port", "heavy", "wbgt_sun", None),
    ("Port yard loading (Mundra)", "mundra_port", "heavy", "wbgt_sun", None),
    ("Cement yard loading", "abdasa_cement", "heavy", "wbgt_sun", "Cement & concrete products"),
    ("Cement plant walk-around", "abdasa_cement", "moderate", "wbgt_sun", "Cement & concrete products"),
    ("Outdoor construction (Bhuj)", "bhuj", "heavy", "wbgt_sun", "Construction trades"),
    ("Stone crushing (Bhuj weather)", "bhuj", "heavy", "wbgt_sun", "Stone & other mineral"),
    ("Crane cab, shaded (Kandla)", "kandla_port", "light", "wbgt_shade", None),
    ("Truck cab, shaded (Mundra)", "mundra_port", "light", "wbgt_shade", None),
]
SHIFTS = {"9am-6pm": (9, 17), "6am-3pm": (6, 14)}
YEAR = 2025
BENCHMARKS = (0.5, 0.9, 2.7, 4.0)  # Cumulative silica, mg/m3-years, from published cohorts.
REVIEW_PLACEHOLDER = 0.5  # Must be replaced or confirmed by a clinician.


def fraction(wbgt, workload):
    for limit, frac in TABLE[workload]:
        if wbgt <= limit:
            return frac
    return 0.0


def teammate_fraction(wbgt):
    """Heavy-work bands in the teammate's rules engine, for comparison only."""
    if wbgt < 28.0:
        return 1.0
    if wbgt < 29.5:
        return 0.75
    if wbgt < 31.0:
        return 0.5
    return 0.25


def load_site(site):
    df = pd.read_csv(REPO / "scripts/data" / f"hourly_{site}_wbgt_methods.csv", parse_dates=["time"])
    df["year"] = df.time.dt.year
    df["month"] = df.time.dt.month
    df["hour"] = df.time.dt.hour
    df["date"] = df.time.dt.date
    return df


SITES = {site: load_site(site) for site in sorted({j[1] for j in JOBS})}


def heat_tables():
    summary, monthly = [], []
    for job, site, workload, col, _ in JOBS:
        df = SITES[site]
        df = df[df.year == YEAR].copy()
        df["frac"] = df[col].map(lambda w: fraction(w, workload))
        row = {"job": job, "site": site, "assumed_workload": workload, "condition": col.replace("wbgt_", "")}
        for shift, (a, b) in SHIFTS.items():
            s = df[df.hour.between(a, b)]
            daily = s.groupby("date").agg(allowed=("frac", "sum"), month=("month", "first"))
            hot = daily[daily.month.between(4, 10)]
            row[f"{shift}_allowed_h_apr_oct"] = round(hot.allowed.mean(), 1)
            row[f"{shift}_worst_month_allowed_h"] = round(daily.groupby("month").allowed.mean().min(), 1)
            row[f"{shift}_days_under_half_shift"] = int((daily.allowed < 4.5).sum())
            row[f"{shift}_hours_beyond_table"] = int((s.frac == 0).sum())
            if shift == "9am-6pm":
                for m, v in daily.groupby("month").allowed.mean().items():
                    monthly.append({"job": job, "month": m, "allowed_h_per_9h_shift": round(v, 1)})
                counts = s.frac.map(LEVEL).value_counts()
                for name in LEVEL.values():
                    row[f"hours_{name}"] = int(counts.get(name, 0))
        summary.append(row)
    pd.DataFrame(summary).to_csv(OUT / "heat_by_job_2025.csv", index=False)
    pd.DataFrame(monthly).to_csv(OUT / "heat_by_job_month_2025.csv", index=False)
    return pd.DataFrame(summary)


def compare_engine():
    rows = []
    for job, site, workload, col, _ in JOBS:
        if workload != "heavy":
            continue
        df = SITES[site]
        s = df[(df.year == YEAR) & df.hour.between(9, 17)]
        table = s[col].map(lambda w: fraction(w, "heavy"))
        engine = s[col].map(teammate_fraction)
        rows.append({
            "job": job,
            "shift_hours": len(s),
            "hours_engine_allows_more_than_table": int((engine > table).sum()),
            "share_pct": round((engine > table).mean() * 100, 1),
            "allowed_h_per_shift_table": round(table.sum() / s.date.nunique(), 1),
            "allowed_h_per_shift_engine": round(engine.sum() / s.date.nunique(), 1),
        })
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "heat_engine_comparison.csv", index=False)
    return out


def dust_model():
    rows = []
    for site, df in SITES.items():
        d = df[df.year == YEAR]
        work = d[d.hour.between(9, 17)]
        daily = d.groupby("date").agg(pm10=("pm10", "mean"), pm25=("pm2_5", "mean"))
        hot_days = work.groupby("date").wbgt_sun.apply(lambda s: (s > 27.5).sum() >= 4)
        rows.append({
            "site": site,
            "work_hours_mean_pm10": round(work.pm10.mean(), 1),
            "work_hours_p95_pm10": round(work.pm10.quantile(0.95), 1),
            "days_mean_pm10_over_100": int((daily.pm10 > 100).sum()),
            "days_mean_pm25_over_60": int((daily.pm25 > 60).sum()),
            "days_4h_over_27_5_sun": int(hot_days.sum()),
        })
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "dust_model_by_site_2025.csv", index=False)
    return out


def silica_scenarios():
    d = pd.read_csv(REPO / "data/processed/osha_silica_personal_samples_2014_2023.csv")
    d = d[d.EIGHT_HR_TWA_CALC == "Y"]
    rows = []
    for group, g in d.groupby("industry_group"):
        if group in ("Other", "Lime/gypsum"):
            continue
        row = {
            "osha_group": group,
            "samples": len(g),
            "inspections": g.INSPECTION_NUMBER.nunique(),
            "pct_recorded_zero": round((g.result_ug_m3 == 0).mean() * 100),
        }
        for p in (50, 75, 90):
            c = g.result_ug_m3.quantile(p / 100)
            row[f"p{p}_ug_m3"] = round(c, 1)
            row[f"p{p}_years_to_0_5"] = round(0.5 / (c / 1000), 1) if c > 0 else None
        row["p90_years_to_2_7"] = round(2.7 / (row["p90_ug_m3"] / 1000), 1) if row["p90_ug_m3"] else None
        rows.append(row)
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "silica_scenarios_by_industry.csv", index=False)
    return out


# Fictional profiles chosen to exercise each route. Not real people or a population sample.
PERSONAS = [
    ("A", 24, "Stone crushing (Bhuj weather)", 4, "Contractor", "state", False),
    ("B", 32, "Stone crushing (Bhuj weather)", 10, "Contractor", "state", True),
    ("C", 47, "Cement yard loading", 20, "Factory", "state", False),
    ("D", 38, "Cement yard loading", 12, "Contractor", "state", False),
    ("E", 41, "Salt-pan raking", 20, "Self-employed", "none", True),
    ("F", 46, "Outdoor construction (Bhuj)", 15, "Construction", "state", False),
    ("G", 42, "Port yard loading (Kandla)", 18, "Dock", "central", False),
    ("H", 35, "Truck cab, shaded (Mundra)", 10, "Transport", "state", False),
]


def persona_routes(heat, silica):
    job_group = {j[0]: j[4] for j in JOBS}
    rows = []
    for pid, age, job, years, employer, sphere, symptoms in PERSONAS:
        legal = (employer in ("Factory", "Construction") and sphere == "state" and age >= 45) or (
            employer in ("Dock", "Construction") and sphere == "central" and age >= 40
        )
        group = job_group[job]
        p75 = p90 = None
        if group:
            s = silica[silica.osha_group == group].iloc[0]
            p75 = round(s.p75_ug_m3 / 1000 * years, 2)
            p90 = round(s.p90_ug_m3 / 1000 * years, 2)
        exposure = p90 is not None and p90 >= REVIEW_PLACEHOLDER
        allowed = heat.loc[heat.job == job, "9am-6pm_allowed_h_apr_oct"].iloc[0]
        routes = [
            name
            for name, on in (("Legal due date", legal), ("Exposure review", exposure), ("Symptoms: doctor review", symptoms))
            if on
        ]
        rows.append({
            "persona": pid,
            "label": "FICTIONAL SCENARIO",
            "age": age,
            "job": job,
            "years_in_job": years,
            "employer_type": employer,
            "symptoms": symptoms,
            "annual_exam_legally_due": legal,
            "silica_cum_p75_mg_m3_yr": p75,
            "silica_cum_p90_mg_m3_yr": p90,
            "heat_allowed_h_apr_oct": allowed,
            "routes": "; ".join(routes) if routes else "No referral; heat advice only",
        })
    out = pd.DataFrame(rows)
    out.to_csv(OUT / "persona_routing_scenarios.csv", index=False)
    return out


def replay_day(site, month, col="wbgt_sun"):
    """Day whose peak WBGT is the median peak of that month in 2025."""
    df = SITES[site]
    df = df[(df.year == YEAR) & (df.month == month)]
    peaks = df.groupby("date")[col].max().sort_values()
    return peaks.index[len(peaks) // 2]


def wokwi_replay():
    days = [("kandla_port", replay_day("kandla_port", 5), "typical May day"),
            ("little_rann_kutch", replay_day("little_rann_kutch", 5), "typical May day")]
    frames = []
    for site, day, label in days:
        d = SITES[site]
        d = d[d.date == day]
        frames.append(pd.DataFrame({
            "site": site,
            "date": str(day),
            "label": label,
            "hour": d.hour.values,
            "air_temp_c": d.temperature_2m.round(1).values,
            "humidity_pct": d.relative_humidity_2m.round().astype(int).values,
            "wind_kmh": d.wind_speed_10m.round(1).values,
            "model_pm10": d.pm10.round(1).values,
            "wbgt_sun_c": d.wbgt_sun.round(1).values,
            "wbgt_shade_c": d.wbgt_shade.round(1).values,
            "heavy_work_level": d.wbgt_sun.map(lambda w: LEVEL[fraction(w, "heavy")]).values,
            "moderate_work_level": d.wbgt_sun.map(lambda w: LEVEL[fraction(w, "moderate")]).values,
            "shaded_light_work_level": d.wbgt_shade.map(lambda w: LEVEL[fraction(w, "light")]).values,
        }))
    out = pd.concat(frames)
    out.to_csv(OUT / "wokwi_heat_replay.csv", index=False)
    return out


def sensor_trace():
    book = REPO / "data/raw/mendeley_construction_pm/DIB_data_Construction_PM.xlsx"
    a = pd.read_excel(book, sheet_name="Alpha sensor 10 min moving avg", header=1)
    s = pd.read_excel(book, sheet_name="Sharp sensor 10 min moving avg", header=1)
    a = a.dropna(axis=1, how="all")
    s = s.dropna(axis=1, how="all")
    a.columns = ["time", "A1", "A2", "A3"]
    s.columns = ["time", "D1", "D2", "D3"]
    m = a.merge(s, on="time")
    for c in m.columns[1:]:
        m[c] = pd.to_numeric(m[c], errors="coerce")
    m["time"] = m.time.astype(str)
    m["minute"] = m.time.str[3:5].astype(int) - 20 + m.time.str[:2].astype(int).sub(3).mul(60)
    m["phase"] = pd.cut(m.minute, [-1, 3, 19, 40], labels=["prep", "mixing", "block laying"])
    minute = m.groupby("minute", as_index=False)[["A1", "A2", "A3", "D1", "D2", "D3"]].mean().round(1)
    minute.to_csv(OUT / "wokwi_dust_replay_by_minute.csv", index=False)
    phases = m.groupby("phase", observed=True)[["A1", "A2", "A3", "D1", "D2", "D3"]].mean().round(1)
    pairs = []
    for x, y in (("A1", "D1"), ("A2", "D2"), ("A3", "D3"), ("A1", "A2"), ("D1", "D2")):
        pairs.append({
            "pair": f"{x} vs {y}",
            "correlation": round(m[x].corr(m[y]), 3),
            "median_ratio": round((m[x] / m[y].where(m[y] > 0)).median(), 1),
        })
    return phases, pd.DataFrame(pairs)


if __name__ == "__main__":
    pd.set_option("display.width", 240, "display.max_columns", 40, "display.max_colwidth", 60)
    heat = heat_tables()
    print(heat[["job", "9am-6pm_allowed_h_apr_oct", "6am-3pm_allowed_h_apr_oct", "9am-6pm_worst_month_allowed_h",
                "9am-6pm_days_under_half_shift", "9am-6pm_hours_beyond_table"]].to_string(index=False))
    print(heat[["job"] + [f"hours_{n}" for n in LEVEL.values()]].to_string(index=False))
    print("\nENGINE\n", compare_engine().to_string(index=False))
    print("\nDUST MODEL\n", dust_model().to_string(index=False))
    silica = silica_scenarios()
    print("\nSILICA\n", silica.to_string(index=False))
    print("\nPERSONAS\n", persona_routes(heat, silica).drop(columns=["label"]).to_string(index=False))
    rep = wokwi_replay()
    print("\nREPLAY\n", rep[rep.site == "kandla_port"][["date", "hour", "air_temp_c", "humidity_pct", "wbgt_sun_c", "wbgt_shade_c", "heavy_work_level", "shaded_light_work_level"]].iloc[5:20].to_string(index=False))
    print(rep.groupby("site").date.first().to_string())
    phases, pairs = sensor_trace()
    print("\nSENSOR PHASES\n", phases.to_string())
    print("\nSENSOR PAIRS\n", pairs.to_string(index=False))
