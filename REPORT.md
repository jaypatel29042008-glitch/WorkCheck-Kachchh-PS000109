# Simple Project Report: Digital Occupational Health Monitoring for Industrial Workers (Kachchh)

**Project:** Seva First Innovation Challenge 2026 · Problem Statement PS000109  
**Target User:** District Development Office (DDO), Kachchh (Gujarat, India)  
**Our Core Idea:** A small, low-cost solar-powered sensor box on the job site measures heat and dust. When heat or dust crosses a dangerous limit, the worker gets a text message in Gujarati or Hindi on their basic phone, and an automatic health check-up is scheduled under existing government programs. The doctor's test result goes into a private digital health passport that the worker owns (linked to their e-Shram identity card), and the District Development Officer sees an anonymous dashboard of factory hotspots.

---

## 1. What We Did

1. **Studied Real Weather and Dust Models for Kachchh (2023 to 2026):**  
   We gathered 33,456 hourly data points from Open-Meteo for five major working sites across Kachchh:
   - **Bhuj** (inland district capital / city workers)
   - **Kandla Port** (major seaport with dock workers and bulk cargo loaders)
   - **Mundra Port** (Special Economic Zone with port handlers and power plant workers)
   - **Little Rann of Kutch** (salt pans where *Agariyas* [salt-farming families] shovel salt in open sunlight)
   - **Abdasa** (limestone quarries and cement manufacturing plants)

2. **Rebuilt WBGT Heat Stress Calculations:**  
   Normal thermometers only measure air temperature. But a human body sweating under the sun feels much hotter if it is humid, sunny, and there is no breeze. We used **WBGT** [Wet Bulb Globe Temperature: a combined heat-stress score that blends air temperature, humidity, wind, and direct sunshine from a black globe thermometer]. We calculated outdoor sun exposure (Liljegren physics method) and shade exposure (Bernard indoor method) for every single hour between 8:00 AM and 6:00 PM (typical working hours).

3. **Compared Government Ground Monitors and Health Research:**  
   We analysed real air pollution data from 5 Gujarat ground stations (CPCB), personal dust samples from factory inspections (OSHA), and medical studies on lung damage (He et al. 2022) and low-cost dust sensors (NIOSH 2024).

4. **Tested Raw Dust Sensor Data:**  
   We plotted a 40-minute experiment of workers mixing concrete and laying solid concrete blocks, comparing two optical dust sensors to see how real sensors behave.

---

## 2. The Top 5 Numbers

Every number below comes directly from verified files in this repository:

1. **2,067 working hours over the danger limit** (`data/processed/kachchh_heat_dust_summary.csv`):  
   In 2025 at Kandla Port, outdoor workers faced 2,067 daytime hours where heat stress crossed the safe limit of **27.5 °C WBGT** [the international threshold where continuous heavy physical labour like lifting and shovelling becomes dangerous for heatstroke]. That is **56.6%** of every daytime working hour in the entire year.
2. **237 dangerous heat days in a single year** (`data/processed/kachchh_heat_dust_summary.csv`):  
   At Kandla Port in 2025, there were 237 days (nearly 2 out of every 3 days) where workers experienced **at least 4 hours in a single shift** exceeding the heavy-work heat limit in the sun.
3. **83.3% of days over the safe dust limit in Gujarat industry** (`data/processed/cpcb_gujarat_station_summary.csv`):  
   At the Vatva industrial estate in Gujarat, government ground monitors showed that 135 out of 162 measured days (83.3%) blew past the national safe daily limit for **PM10** [dust particles smaller than 10 micrometres, about 5 times thinner than a human hair, that get trapped in your throat and lungs]. By comparison, green Gandhinagar exceeded it on only 31.4% of days.
4. **2.46× higher odds of abnormal lung damage** (`docs/papers/He_2022_dust_exposure_lung_function_China.pdf`):  
   A medical study of 2,045 industrial workers proved that workers exposed to excessive workplace dust had **2.46 times higher odds** of developing abnormal lung airflow (a reduced FEV1/FVC ratio [how much air you can forcefully blow out of your lungs in one second compared to a full breath]) compared to workers breathing clean air.
5. **31× disagreement between uncalibrated dust sensors** (`data/raw/mendeley_construction_pm/DIB_data_Construction_PM.xlsx`):  
   During a 40-minute concrete mixing experiment, two cheap optical dust sensors sitting just 1 metre from the cement mixer gave readings that differed by a factor of **31.3×** (one peaked at ~10,931 while the other peaked at ~349). Crucially, the dataset sheet did not even specify the unit of measurement. This proves cheap sensors cannot trigger medical check-ups without proper site calibration!

---

## 3. What Each Chart Shows

### Chart 1: `charts/kachchh_heat_hours_by_site.png`
*(Kachchh Worksite Heat Strain Exposure in 2025 – Sun vs. Shade)*
- **What it shows:** A side-by-side comparison of annual working hours (8:00 AM to 6:00 PM) that cross the safe heavy-work limit (27.5 °C WBGT) across all 5 sites.
- **Key takeaway:** Working in direct sunlight causes between **1,741 hours** (Bhuj) and **2,067 hours** (Kandla Port) of dangerous heat stress per year. Even if an employer provides shade, workers still face **604 to 997 hours** above the safe threshold due to coastal humidity and high ambient air temperature.

### Chart 2: `charts/kachchh_heat_by_month.png`
*(Seasonal Heat Stress Trajectory Across Kachchh)*
- **What it shows:** The monthly timeline of daytime working hours above 27.5 °C WBGT throughout 2025 for each site.
- **Key takeaway:** The danger season is not just one hot week in May—it lasts for **7 continuous months** from April through October. In peak months (May, June, July, and September), workers spend between **250 and 290 hours per month** (almost every single working hour) in dangerous heat.

### Chart 3: `charts/kachchh_dust_days.png`
*(Days Exceeding 24-Hour PM10 NAAQS Limit in 2025 – CAMS Model)*
- **What it shows:** The number of days in 2025 where regional ambient PM10 exceeded the Indian 24-hour safe limit of 100 µg/m³ according to the European satellite model (CAMS).
- **Key takeaway:** Mundra Port had 6 days and Abdasa Cement had 4 days exceeding the regional background limit. However, as explained below, satellite models smooth out entire districts and cannot see the dense cloud of limestone or coal dust hovering 2 metres from a worker's mouth.

### Chart 4: `charts/mendeley_dust_trace.png`
*(40-Minute Real-Time Construction Dust Trace)*
- **What it shows:** A 40-minute minute-by-minute timeline of dust readings during preparatory work (3:20–3:24), concrete mixing (3:24–3:40), and solid concrete block laying (3:40–4:00).
- **Key takeaway:** Dust peaks violently during the **concrete mixing phase** (pouring dry sand and cement into the mixer). It also exposes a critical technical truth: the Alphasense sensor recorded numbers up to 10,931, while the Sharp sensor recorded 349. They show the same wave-like shape, but cheap optical sensors require calibration against physical filter samples before trusting their numbers.

---

## 4. Limits of the Data (Honesty Disclosures)

To be completely honest and transparent with the District Administration, we must declare what this data is and what it is not:

1. **Weather Models vs. Worksite Sensors:**  
   Our Kachchh heat and dust numbers come from **Open-Meteo ERA5 atmospheric reanalysis** and the **CAMS air-quality model**. These are regional computer models covering grid squares of roughly 30 to 40 kilometres. They do **not** represent a physical sensor sitting on a worker's chest in a salt pan or inside a cement kiln. Real worksites may have reflected heat off white salt crystals or intense dust plumes that the weather model cannot see.
2. **No Overlap Between CPCB Ground Stations and Our Kachchh Data:**  
   The measured CPCB Gujarat station data covers **2019 to 2020** (only ~150 measured days of PM10). Our downloaded Kachchh weather and CAMS dust data covers **2023 to 2026**. There is **zero calendar overlap** between these two datasets. We cannot directly match a CAMS model day in Kachchh with a CPCB ground station reading from the same date.
3. **OSHA Inspection Bias:**  
   The silica dust samples from the US (OSHA) showed that 26.2% exceeded legal safety limits. However, OSHA inspectors do not visit factories at random—they go when workers complain or after accidents happen. Therefore, these inspection samples naturally overstate the general industry average.
4. **Bernard Shade Formula Ambiguity:**  
   The natural wet-bulb equation used for calculating shade WBGT was taken from Lemke & Kjellstrom (2012), which cites Bernard (1999). Lemke & Kjellstrom explicitly noted that the original published text had typographical errors and ambiguities in its formulas. We used the formula exactly as published without inventing adjustments, but on-site hardware should use a physical black-globe thermometer.
5. **Missing Units in Mendeley Dust Data:**  
   The author of the Mendeley construction dataset (`DIB_data_Construction_PM.xlsx`) documented that the sheets contain "PM10 concentration", but completely left out the physical unit of measurement (neither µg/m³, mg/m³, nor raw voltage counts are stated). We report this omission openly rather than guessing.

---

## 5. What We Still Need (Next Steps)

To take this from an engineering hackathon prototype to a functioning district-wide program in Kachchh, the project requires:

1. **Physical Site Calibration:**  
   Cheap optical sensors ($15–$30) drift when exposed to coastal salt moisture or thick cement dust. We need co-located **gravimetric filter pumps** [a small air pump with a laboratory-weighed filter pad] run for 8 hours once per quarter at each site to calibrate the optical sensors to true respirable silica and dust mass.
2. **Hardware Glitch Filtering:**  
   As proven in the NIOSH (2024) mining study, low-cost dust sensors experience sudden false "spike events" (spiking to over 10,000 µg/m³ or maximum electrical voltage for a few seconds). Our server ingestion rules must automatically drop single-second spikes greater than 10,000 µg/m³ to avoid sending false medical panic alerts to workers.
3. **Local Microclimate Field Pilot:**  
   Deploy 5 physical prototype sensor nodes (measuring air temperature, relative humidity, black-globe radiant temperature, and wind speed) at:
   - 1 salt pan in Little Rann of Kutch (testing salt crust radiant reflection)
   - 1 bulk berth at Kandla Port (testing coastal humidity and coal dust)
   - 1 limestone quarry in Abdasa (testing heavy mineral dust)
4. **Integration with e-Shram and Ayushman Bharat (ABHA):**  
   Connect exposure triggers to the district's Community Health Centres (CHCs) and Mobile Medical Units, so that high-exposure alerts place migrant and contractor workers on a priority list for check-ups, with a clinician deciding the tests (such as spirometry, chest X-ray and kidney function).

