# Wokwi connection service

This is the layer between a Wokwi (or real) ESP32 site node and the project data.

**Tested:** service tests and a live fake device on this computer. **Not tested:** a real Wokwi sketch, a public URL, or your teammate's live dashboard.

## Start it

```bash
cd wokwi_bridge
python3 -m pip install fastapi uvicorn httpx pytest
python3 -m uvicorn app:app --host 0.0.0.0 --port 8080
```

Interactive API docs are at `http://localhost:8080/docs`.

Test it without Wokwi, in a second terminal:

```bash
python3 fake_device.py --url http://127.0.0.1:8080
```

Run the automated tests:

```bash
python3 -m pytest test_bridge.py -q
```

## How Wokwi reaches this service

Inside the sketch, connect with `WiFi.begin("Wokwi-GUEST", "", 6)`.

| Option | Address used in the sketch | Notes |
|---|---|---|
| **Public URL (free Wokwi)** | `https://your-public-url` | Host the service or use a tunnel. Wokwi's public gateway cannot reach `localhost`. Set `BRIDGE_API_KEY` first. |
| **Private Gateway (paid Wokwi)** | `http://host.wokwi.internal:8080` | Runs on your computer; available to paying users only. |

## What the sketch calls

### 1. Replay one day (optional)

```text
POST /api/v1/devices/node-01/session
{"location_id":"kandla_port","date":"2025-05-19","job_id":"port_yard_kandla","start_hour":0}
```

```text
GET /api/v1/devices/node-01/replay/next
```

Each call returns the next hour, and restarts after 23:00:

```json
{"site_id":"kandla_port","time":"2025-05-19 12:00:00","workload":"heavy","ambient_temp_c":34.8,
 "relative_humidity_pct":55.0,"model_pm10":27.0,"wbgt_c":32.5,"allowed_work_pct":0,
 "lamp":"RED_FLASH","action":"Beyond the table: supervisor must review heavy work now.",
 "day_complete":false,"label":"Replay of model data, not a worksite measurement"}
```

### 2. Send a sensor reading

```text
POST /api/v1/telemetry
```

```json
{"site_id":"kandla_port","device_id":"node-01","job_id":"port_yard_kandla","source":"wokwi_simulated",
 "ambient_temp_c":34.8,"relative_humidity_pct":55.0,"globe_temp_c":47.0,"pm10_0_ug_m3":85.0}
```

The sketch uses `lamp` and `action` from the reply:

```json
{"reading_id":1,"wbgt_c":32.0,"wbgt_method":"iso_outdoor_estimated_wet_bulb","allowed_work_pct":0,"lamp":"RED_FLASH",
 "action":"Beyond the table: supervisor must review heavy work now.","dust_flag":false,
 "dust_note":"Dust indication only; it does not measure silica or diagnose disease.","forward_status":"not_configured"}
```

The field names match the dashboard's `TelemetryPayload`, plus `job_id` and `source`, which are not forwarded.

### 3. New parameters

Add any of these to the telemetry request:

```json
{"noise_dba":90.0,"uv_index":9.5,"urine_colour_score":6,"worker_id":"W001","sample_minutes":5}
```

`sample_minutes` is the time that reading covers, and it is used for the running daily doses. The reply adds:

```json
{"noise_dose_today_pct":122.4,"uv_dose_today_sed":12.3,"alert_note":"Prototype alerts with placeholder thresholds. They do not diagnose disease.",
 "alerts":[{"code":"NOISE_DOSE_OVER_100","message":"Today's noise dose is above 100%: use ear protection. Repeated days lead to a hearing test."}]}
```

| Alert code | When it fires |
|---|---|
| `NOISE_DOSE_OVER_100` | Today's device noise dose passes 100% (85 dBA, 3 dB exchange) |
| `UV_HIGH` | UV index is 8 or more (placeholder) |
| `HOT_DAY_DARK_URINE` | Colour score is 5 or more and WBGT is 27.5 °C or more (placeholder) |
| `HOURS_55_PLUS` | Check-ins total 55+ hours this week |

Worker check-in, from a QR or RFID scan:

```text
POST /api/v1/checkin
{"worker_id":"W001","device_id":"node-01","site_id":"kandla_port","event":"in"}
```

Use `"event":"out"` at the end of the shift. Read the total with `GET /api/v1/workers/W001/hours`.

Noise, colour score and sample minutes are not forwarded to the dashboard, because its telemetry format doesn't take them. **Daily doses are per device, not per worker, and UTC-based.** Set `BRIDGE_API_KEY` before exposing the service, because stored readings can include health-related data.

Other routes: `GET /health`, `GET /api/v1/catalog`, `GET /api/v1/readings`, `GET /api/v1/devices/{id}/latest`.

## Lamp values

| `lamp` | Work level from the table |
|---|---|
| `GREEN` | 100% |
| `YELLOW` | 75% |
| `ORANGE` | 50% |
| `RED` | 25% |
| `RED_FLASH` | Beyond the table: needs supervisor review |

## Send readings to the dashboard

```bash
DASHBOARD_TELEMETRY_URL=http://HOST:PORT/api/telemetry python3 -m uvicorn app:app --host 0.0.0.0 --port 8080
```

`site_id` must exist in the dashboard's `sites` table. If forwarding fails, the reading is still kept here and `forward_status` shows the error.

## Things to keep honest

- **Send a globe reading.** Without one, the service uses a shade estimate and labels it `shade_estimate_no_globe`. On the test day this read about 3 °C lower than the sun estimate at noon, which could understate risk.
- **Send `job_id`.** Without it, the service uses heavy work and sets `workload_assumed_default` to true.
- **`dust_flag` is an uncalibrated demo flag.** It uses PM10 above 100 and is not a silica result.
- **Wokwi data is simulated.** Keep `source` as `wokwi_simulated` and don't present it as field data.
