"""Summarise downloaded public data for the PS000109 dataset. Reads data files only."""
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
DL = HERE / "public_downloads"
NOTES = HERE.parent / "research_notes" / "Occupational alert parameter evidence"
SIC_GROUPS = [
    ("Cement", r"^Cement"), ("Crushed stone", r"^Crushed, Broken"), ("Sand and gravel", r"Sand and Gravel|^Sand,"),
    ("Clay and ceramic materials", r"Clay|Kaolin|Feldspar"), ("Lime and gypsum", r"^Lime|^Gypsum"), ("Salt", r"^Salt"),
]
JOB_CLASSES = [("Crusher", r"CRUSH"), ("Truck", r"TRUCK"), ("Loader", r"LOADER|HIGHLIFT|FRONT END"), ("Crane or dragline", r"CRANE|DRAGLINE"),
               ("Kiln, mill or grinding", r"KILN|MILL|GRIND"), ("Bagging or packing", r"BAG|PACK")]


def _group(sic):
    for name, pattern in SIC_GROUPS:
        if re.search(pattern, str(sic).strip(), re.I):
            return name
    return None


def _job(desc):
    for name, pattern in JOB_CLASSES:
        if re.search(pattern, str(desc), re.I):
            return name
    return "Other jobs"


def _mines():
    m = pd.read_csv(DL / "msha_mines/extracted/Mines.txt", sep="|", encoding="latin1", low_memory=False, usecols=["MINE_ID", "PRIMARY_SIC"])
    m["commodity_group"] = m.PRIMARY_SIC.map(_group)
    return m.dropna(subset=["commodity_group"])[["MINE_ID", "commodity_group"]]


def _rollup(df, value, keep):
    rows = []
    for (group, job), g in pd.concat([df, df.assign(job_class="All jobs")]).groupby(["commodity_group", "job_class"]):
        row = {"commodity_group": group, "job_class": job, "samples": len(g), "mines": g.MINE_ID.nunique(), "first_year": int(g.year.min()), "last_year": int(g.year.max())}
        row.update(keep(g[value]))
        row["sample_note"] = "Fewer than 30 samples; treat as weak" if len(g) < 30 else ""
        rows.append(row)
    return pd.DataFrame(rows)


def msha_noise():
    n = pd.read_csv(DL / "msha_noise/extracted/NoiseSamples.txt", sep="|", encoding="latin1", low_memory=False,
                    usecols=["MINE_ID", "SURVEY_DATE", "OCCUPATION_CD_DESC", "TOTAL_SURVEY_TIME", "PEL_DOSE_90"])
    n = n.merge(_mines(), on="MINE_ID")
    n = n[n.TOTAL_SURVEY_TIME.between(360, 720) & n.PEL_DOSE_90.between(0, 10000)].copy()
    n["year"] = pd.to_numeric(n.SURVEY_DATE.str[-4:], errors="coerce")
    n["job_class"] = n.OCCUPATION_CD_DESC.map(_job)
    n["twa"] = np.where(n.PEL_DOSE_90 > 0, 90 + 16.61 * np.log10(n.PEL_DOSE_90.where(n.PEL_DOSE_90 > 0) / 100), np.nan)

    def stats(s):
        return {"p50_twa_dba_5db": round(s.quantile(.5), 1), "p75_twa_dba_5db": round(s.quantile(.75), 1), "p90_twa_dba_5db": round(s.quantile(.9), 1),
                "pct_at_or_over_90_dba": round((s >= 90).mean() * 100, 1), "pct_zero_dose_excluded": round(s.isna().mean() * 100, 1)}
    return _rollup(n, "twa", stats)


def msha_silica():
    """CONCENTRATION is respirable dust in mg/m3. Silica is derived from the limit formula E = 10 / (%quartz + 2)."""
    p = pd.read_csv(DL / "msha_personal_health/extracted/PersonalHealthSamples.txt", sep="|", encoding="latin1", low_memory=False,
                    usecols=["MINE_ID", "SAMPLE_DATE", "CONTAMINANT_DESC", "CONCENTRATION", "EXPOSURE_LIMIT", "JOB_CD_DESC"])
    # Limits from about 0.098 (100% quartz) to 3.33 (1% quartz) fit the formula for this contaminant.
    p = p[p.CONTAMINANT_DESC.str.strip().eq("Quartz, respirable, >1% Qtz") & p.CONCENTRATION.between(0, 50) & p.EXPOSURE_LIMIT.between(0.098, 3.34)].merge(_mines(), on="MINE_ID")
    p["year"] = pd.to_numeric(p.SAMPLE_DATE.str[-4:], errors="coerce")
    p["job_class"] = p.JOB_CD_DESC.map(_job)
    p["implied_quartz_pct"] = 10 / p.EXPOSURE_LIMIT - 2
    p["silica"] = p.CONCENTRATION * p.implied_quartz_pct / 100 * 1000
    rows = []
    for (group, job), g in pd.concat([p, p.assign(job_class="All jobs")]).groupby(["commodity_group", "job_class"]):
        rows.append({"commodity_group": group, "job_class": job, "samples": len(g), "mines": g.MINE_ID.nunique(), "first_year": int(g.year.min()), "last_year": int(g.year.max()),
                     "dust_p50_ug_m3": round(g.CONCENTRATION.quantile(.5) * 1000, 1), "dust_p90_ug_m3": round(g.CONCENTRATION.quantile(.9) * 1000, 1),
                     "implied_quartz_pct_p50": round(g.implied_quartz_pct.quantile(.5), 1),
                     "derived_silica_p50_ug_m3": round(g.silica.quantile(.5), 1), "derived_silica_p75_ug_m3": round(g.silica.quantile(.75), 1), "derived_silica_p90_ug_m3": round(g.silica.quantile(.9), 1),
                     "pct_over_50_ug_m3": round((g.silica > 50).mean() * 100, 1), "sample_note": "Fewer than 30 samples; treat as weak" if len(g) < 30 else ""})
    return pd.DataFrame(rows)


def niosh_noise():
    base = next((DL / "niosh_hhe/extracted").glob("*/datasets"))
    personal = pd.read_csv(base / "HHE-Noise-Database-Personal-Data.csv", encoding="latin1", low_memory=False)
    company = pd.read_csv(base / "HHE-Noise-Database-Company-Info.csv", encoding="latin1", low_memory=False)[["HHE No.", "State", "NAICS Code", "NORA Sector", "Facility description"]]
    out = personal.merge(company, on="HHE No.", how="left")[["HHE No.", "NAICS Code", "NORA Sector", "Facility description", "Area/Department", "Job Title", "Noise-generating activities", "Duration (hh:mm)", "NIOSH REL (dBA)", "NIOSH REL (%)", "OSHA PEL (dBA)"]]
    out.columns = ["hhe_no", "naics", "sector", "facility", "area", "job_title", "activity", "duration", "niosh_rel_dba", "niosh_rel_dose_pct", "osha_pel_dba"]
    for c in ("niosh_rel_dba", "niosh_rel_dose_pct", "osha_pel_dba"):
        out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def lancet_india():
    h = pd.read_csv(DL / "lancet_countdown/working_hours_lost.csv", low_memory=False)
    h = h[h.geography_name.eq("India")]
    o = pd.read_csv(DL / "lancet_countdown/outdoor_workers.csv", low_memory=False)
    o = o[o.geography_name.eq("India")] if "geography_name" in o else o.iloc[0:0]
    return h, o


def ilostat(name):
    return pd.read_csv(DL / f"ilostat_india/{name}.csv", encoding="utf-8-sig", low_memory=False)


def _number(text):
    text = text.replace(",", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def plfs_gujarat():
    lines = (NOTES / "work_hours.md").read_text(encoding="utf-8").splitlines()
    t41, t43 = [], []
    target = None
    for line in lines:
        if line.startswith("**Table 41, Gujarat"):
            target = t41
        elif line.startswith("**Table 43, Gujarat"):
            target = t43
        elif line.startswith("**") and target is not None and "Table" not in line[:12]:
            target = None
        if target is None or not re.match(r"\| *\d+ *\|", line):
            continue
        target.append([c.strip() for c in line.strip().strip("|").split("|")])
    a = pd.DataFrame(t41, columns=["pdf_page", "quarter", "sector_sex", "own_account_employer", "helper", "self_employed_all", "regular_salaried", "casual_labour", "all_workers"])
    b = pd.DataFrame(t43, columns=["pdf_page", "quarter", "sector_sex", "le_12", "h12_24", "h24_36", "h36_48", "h48_60", "h60_72", "h72_84", "over_84", "gujarat_over_48", "gujarat_over_60", "gujarat_over_72", "sample_workers", "est_workers_00s", "all_india_over_48", "all_india_over_60"])
    for frame in (a, b):
        for c in frame.columns:
            if c not in ("quarter", "sector_sex"):
                frame[c] = frame[c].map(_number)
    return a, b


def source_register():
    rows = [
        ("MSHA Noise Samples", "US mines, 2000-2026", "public_downloads/msha_noise", "Summarised: msha_noise_by_commodity_job", "US government work; confirm terms", "https://arlweb.msha.gov/OpenGovernmentData/DataSets/NoiseSamples.zip", "US mines; 5 dB exchange rate"),
        ("MSHA Personal Health Samples", "US mines, 2000-2026", "public_downloads/msha_personal_health", "Summarised: msha_silica_by_commodity_job", "US government work; confirm terms", "https://arlweb.msha.gov/OpenGovernmentData/DataSets/PersonalHealthSamples.zip", "US inspections; job names differ from Kachchh"),
        ("MSHA Quartz Samples", "US mines, 2000-2026", "public_downloads/msha_quartz", "Raw only; almost entirely coal mines", "US government work; confirm terms", "https://arlweb.msha.gov/OpenGovernmentData/DataSets/QuartzSamples.zip", "Coal focus"),
        ("MSHA Mines", "US mine register", "public_downloads/msha_mines", "Used to group samples by commodity", "US government work; confirm terms", "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip", "Primary commodity only"),
        ("NIOSH HHE noise", "US, 1996-2013", "public_downloads/niosh_hhe", "Loaded: niosh_hhe_noise_personal", "US government; confirm terms", "https://data.cdc.gov/download/87ea-ip25/application%2Fzip", "US evaluations; not a random sample"),
        ("Lancet Countdown 2026", "National, modelled", "public_downloads/lancet_countdown", "Loaded: lancet_india_hours_lost, lancet_india_outdoor_workers", "Check site terms", "https://data.lancetcountdown.org/downloads/2026/1.1.3/9691d5c2da24/lancet-countdown-2026-1.1.3-working-hours-lost.csv", "India only; column units inferred"),
        ("ILOSTAT India hours", "National", "public_downloads/ilostat_india", "Loaded: ilostat_india_*", "ILO terms", "https://rplumber.ilo.org/data/indicator/?id=HOW_TEMP_SEX_ECO_NB_A&ref_area=IND&format=.csv", "Levels conflict with PLFS; use to rank"),
        ("PLFS 2023-24 report", "Gujarat, official survey", "public_downloads/plfs_report", "Loaded: plfs_gujarat_table41, plfs_gujarat_table43", "Official report", "https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf", "Gujarat-level, not Kachchh"),
        ("Buono CIE urine colour", "Human study", "public_downloads/mendeley_fkbjjf95ws", "Raw only; for method work", "CC BY 4.0", "https://data.mendeley.com/datasets/fkbjjf95ws", "Non-workers"),
        ("Muraishi heat tolerance", "17 soccer players", "public_downloads/mendeley_7p4jwfkkdb", "Raw only", "CC BY-NC 3.0, non-commercial", "https://data.mendeley.com/datasets/7p4jwfkkdb/1", "Non-workers; non-commercial"),
        ("Bangladesh urinalysis", "Clinical records", "public_downloads/mendeley_6xhr6sfsr9", "Raw only; NOT loaded because it has patient name and ID columns", "CC BY 4.0", "https://data.mendeley.com/datasets/6xhr6sfsr9", "Clinical patients; check for personal data before use"),
        ("URBANOME biomarkers", "Greece", "public_downloads/urbanome", "Raw only", "CC BY 4.0", "https://zenodo.org/records/16965005", "Not workers in hot climates"),
        ("Gridded labour capacity, ERA5", "Global, modelled", "public_downloads/zenodo_labor", "Raw only; not extracted to Kachchh yet", "CC BY 4.0", "https://zenodo.org/records/21636524", "Model data"),
        ("Gridded labour capacity, CMIP6", "Global, modelled", "Not downloaded", "About 5.3 GB of future-climate files", "CC BY 4.0", "https://zenodo.org/records/21636524", "Not needed for current work"),
        ("noiseJEM", "Noise job-exposure matrix", "Not downloaded", "Site blocked automated access; try in a browser", "Unknown", "https://noisejem.sph.umich.edu/about.html", "US-focused; unconfirmed"),
        ("PLFS microdata", "Person-level hours, may allow Kachchh", "Not downloaded", "Needs your free login", "Read terms first", "https://microdata.gov.in/NADA/index.php/catalog/292/get-microdata", "Kachchh estimate would be unofficial"),
        ("OMI and TEMIS UV", "Satellite UV", "Not downloaded", "Large gridded products; no single file for Kachchh", "See provider", "https://www.temis.nl/uvradiation/UVarchive.php", "Satellite; TEMIS clear-sky only for India"),
        ("Worker cohorts: Venugopal, Hansson, Dutta", "Person-level", "Not available", "Only by writing to the authors", "By request", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10334398", "Needs author approval"),
    ]
    return pd.DataFrame(rows, columns=["source", "coverage", "location", "status", "licence", "url", "limit_for_kachchh"])
