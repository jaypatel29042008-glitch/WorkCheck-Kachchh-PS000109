# Wokwi ESP32 Hardware Integration Guide

This guide explains how the **Wokwi ESP32 Multi-Hazard Site Node** connects into the **WorkCheck Kachchh Platform**.

---

## 1. What the Simulated Hardware Does

The site node simulation models a solar-powered environmental telemetry station deployed at industrial worksites (e.g. Kandla Port, Little Rann salt pans, Abdasa cement works):

| Hardware Component | Wokwi Part | GPIO Pin | Measured Hazard |
|---|---|---|---|
| Air Temperature & Humidity | `wokwi-dht22` | GPIO 14 | Ambient dry-bulb temperature & RH |
| Black Globe Thermometer | `wokwi-ds18b20` | GPIO 4 | Radiant heat from direct solar load |
| Dust Concentration Sensor | `potentiometer` (ADC1_6) | GPIO 34 | Simulated PM10 & PM2.5 particulate levels (0–300 µg/m³) |
| Sound Level Meter / Mic | `potentiometer` (ADC1_7) | GPIO 35 | Simulated industrial yard noise (45–105 dBA) |
| Solar UV Sensor | `photoresistor` (ADC1_4) | GPIO 32 | UV Index (0–14) |
| OLED Local Display | `ssd1306` (128x64 I2C) | SDA 21, SCL 22 | Real-time on-site readouts for site supervisors |
| Physical Alert Lamp | `red-led` | GPIO 26 | Flashes during heat/dust alarm states (`RED_FLASH`) |
| Audible Warning Buzzer | `piezo-buzzer` | GPIO 27 | Sounds 1.8 kHz pulse when hazard crosses threshold |

Online Wokwi Project: [https://wokwi.com/projects/479831190538594305](https://wokwi.com/projects/479831190538594305)

---

## 2. Three Ways to Connect

### Option A: In-Browser 1-Click Streamer (Zero Setup, Works 100% Offline)
1. Start the WorkCheck platform: `run.command` (Mac) or `python3 -m uvicorn app.main:app --port 8090`.
2. Open `http://localhost:8090` and log in as Site Supervisor (`site@workcheck.demo` / `Demo-Site-2026`).
3. Under **Site monitor**, click the **Wokwi device** tab.
4. Click **"Stream Live Wokwi Device"**.
5. The connection badge immediately turns **Green** (`Connected, last reading 0s ago`), telemetry streams every 3s, and site hazard directives update in real time.

### Option B: Terminal Feeder Script (CLI)
Run the bundled Python feeder script from any terminal:

```bash
cd workcheck_platform
python3 wokwi/stream_wokwi.py
```

To test a severe dust spike (e.g. concrete mixing at a cement yard):
```bash
python3 wokwi/stream_wokwi.py --dust-spike
```

### Option C: Connect Real Online Wokwi Browser Simulator (Public Tunnel)
Because free Wokwi runs in cloud sandboxes, it cannot reach your computer's `localhost` directly. You need a public tunnel address:

1. Expose local port 8090:
   ```bash
   npx localtunnel --port 8090
   # or: cloudflared tunnel --url http://localhost:8090
   ```
2. Copy the resulting HTTPS address (e.g. `https://quiet-river-42.loca.lt`).
3. Open the Wokwi project at `https://wokwi.com/projects/479831190538594305`.
4. In `sketch.ino`, set:
   ```cpp
   const char* PLATFORM_URL = "https://quiet-river-42.loca.lt/api/v1/telemetry";
   ```
   (Replace with your generated tunnel URL).
5. Click **Play** (green start button) in Wokwi.
6. The ESP32 connects to `Wokwi-GUEST` WiFi and sends telemetry every 5 seconds. The platform dashboard updates live!

---

## 3. Files in this Directory

- `diagram.json`: Complete circuit layout and pin wiring for Wokwi.
- `sketch.ino`: Production ESP32 firmware with WiFi, HTTP POST, OLED display, and sensor acquisition.
- `stream_wokwi.py`: Lightweight Python stream generator for offline testing and rapid demonstrations.
- `wokwi_platform_patch.ino`: Minimal patch for existing Arduino sketches.

