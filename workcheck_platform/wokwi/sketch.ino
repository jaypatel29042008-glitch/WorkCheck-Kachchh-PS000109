/*
 * WorkCheck Kachchh - ESP32 Multi-Hazard Site Node (Wokwi Firmware)
 * Project ID: PS000109 - Digital Occupational Health Monitoring
 * Online Simulator: https://wokwi.com/projects/479831190538594305
 *
 * Hardware Connections in Wokwi diagram.json:
 * - DHT22 (Air Temp & Relative Humidity) -> GPIO 14
 * - DS18B20 (Black Globe Thermometer Probe) -> GPIO 4
 * - Potentiometer 1 (Dust Sensor stand-in: PM10/PM2.5) -> GPIO 34 (ADC1_CH6)
 * - Potentiometer 2 (Sound Level Mic stand-in: Noise dBA) -> GPIO 35 (ADC1_CH7)
 * - LDR Photoresistor (Solar Radiation / UV stand-in) -> GPIO 32 (ADC1_CH4)
 * - Red High-Alert LED -> GPIO 26
 * - Piezo Buzzer -> GPIO 27
 * - SSD1306 128x64 I2C OLED -> SDA=GPIO 21, SCL=GPIO 22
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------------------------------------------------------------------
// Network & Platform Configuration
// ---------------------------------------------------------------------------
// For local testing via tunnel (e.g. npx localtunnel --port 8090 or cloudflared):
// Set PLATFORM_URL to your public tunnel HTTPS URL.
// Free Wokwi runs in cloud containers and cannot reach "localhost" directly.
const char* PLATFORM_URL = "https://YOUR-PUBLIC-TUNNEL-URL/api/v1/telemetry";
const char* DEVICE_KEY   = "demo-device-key";
const char* DEVICE_ID    = "wokwi-node-01";
const char* SITE_ID      = "kandla_port";
const uint32_t TELEMETRY_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Pin Assignments
// ---------------------------------------------------------------------------
#define DHT_PIN          14
#define DHT_TYPE         DHT22
#define ONE_WIRE_BUS     4
#define POT_DUST_PIN     34
#define POT_NOISE_PIN    35
#define LDR_UV_PIN       32
#define LED_ALERT_PIN    26
#define BUZZER_PIN       27

#define SCREEN_WIDTH     128
#define SCREEN_HEIGHT    64
#define OLED_RESET       -1

// Peripherals
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// State tracking
uint32_t lastSendMs = 0;
String currentLamp = "GREEN";
float lastWbgt = 0.0;
bool wifiOk = false;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println("\n=============================================");
  Serial.println("  WorkCheck Kachchh - ESP32 Site Node Starting");
  Serial.println("=============================================");

  pinMode(LED_ALERT_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_ALERT_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize Sensors
  dht.begin();
  ds18b20.begin();

  // Initialize OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("Warning: SSD1306 OLED initialization failed.");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("WorkCheck Kachchh");
    display.println("Site Node: " + String(DEVICE_ID));
    display.println("Connecting WiFi...");
    display.display();
  }

  // Connect to simulated Wokwi WiFi
  connectWiFi();
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to Wokwi WiFi...");
  WiFi.begin("Wokwi-GUEST", "", 6);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(250);
    Serial.print(".");
    tries++;
  }
  wifiOk = (WiFi.status() == WL_CONNECTED);
  if (wifiOk) {
    Serial.printf("\nWiFi Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi Connection failed. Running in offline mode.");
  }
}

// ---------------------------------------------------------------------------
// Main Sampling & Telemetry Loop
// ---------------------------------------------------------------------------
void loop() {
  uint32_t now = millis();

  if (now - lastSendMs >= TELEMETRY_INTERVAL_MS) {
    lastSendMs = now;

    // 1. Read Air Temperature & Relative Humidity
    float airTemp = dht.readTemperature();
    float humidity = dht.readHumidity();
    if (isnan(airTemp) || isnan(humidity)) {
      airTemp = 34.5;
      humidity = 48.0;
    }

    // 2. Read Black Globe Temperature (OneWire DS18B20)
    ds18b20.requestTemperatures();
    float globeTemp = ds18b20.getTempCByIndex(0);
    if (globeTemp < -50 || globeTemp > 85) {
      // Stand-in fallback: solar heating increases globe temp above air temp
      globeTemp = airTemp + 12.0;
    }

    // 3. Read Potentiometer 1 -> Dust Concentration (PM10: 0 to 300 ug/m3)
    int rawDust = analogRead(POT_DUST_PIN);
    float pm10 = map(rawDust, 0, 4095, 10, 300);
    float pm25 = pm10 * 0.45; // Respirable fine fraction

    // 4. Read Potentiometer 2 -> Industrial Noise (45 to 105 dBA)
    int rawNoise = analogRead(POT_NOISE_PIN);
    float noiseDba = map(rawNoise, 0, 4095, 45, 105);

    // 5. Read LDR -> Solar / UV Index (0 to 14)
    int rawLdr = analogRead(LDR_UV_PIN);
    // Lower resistance in bright sunlight produces higher ADC reading or inverted depending on divider
    float uvIndex = map(constrain(rawLdr, 0, 4095), 0, 4095, 0, 140) / 10.0;

    // 6. Update OLED Display
    updateDisplay(airTemp, humidity, globeTemp, pm10, noiseDba, uvIndex);

    // 7. Transmit Telemetry Packet to WorkCheck Platform
    sendTelemetry(airTemp, humidity, globeTemp, pm10, pm25, uvIndex, noiseDba);

    // 8. Physical Alert Actuation
    handleAlertActuators();
  }

  delay(100);
}

// ---------------------------------------------------------------------------
// OLED Display Renderer
// ---------------------------------------------------------------------------
void updateDisplay(float airT, float rh, float globeT, float pm10, float noise, float uv) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);

  // Top header bar
  display.printf("WC-NODE: %s\n", SITE_ID);
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Sensor readouts
  display.setCursor(0, 13);
  display.printf("Air:%.1fC  RH:%.0f%%\n", airT, rh);
  display.printf("Globe:%.1fC WBGT:%.1fC\n", globeT, lastWbgt);
  display.printf("Dust PM10: %.0fug/m3\n", pm10);
  display.printf("Noise:%.0fdB  UV:%.1f\n", noise, uv);

  // Status Lamp footer
  display.drawLine(0, 52, 127, 52, SSD1306_WHITE);
  display.setCursor(0, 55);
  display.printf("STATUS: [%s]", currentLamp.c_str());

  display.display();
}

// ---------------------------------------------------------------------------
// HTTP Telemetry Transmission
// ---------------------------------------------------------------------------
void sendTelemetry(float airT, float rh, float globeT, float pm10, float pm25, float uv, float noise) {
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping send: WiFi offline.");
    return;
  }

  // Check if URL is still the placeholder
  if (strstr(PLATFORM_URL, "YOUR-PUBLIC-TUNNEL-URL") != NULL) {
    Serial.println("Notice: Set PLATFORM_URL to your public tunnel HTTPS URL in sketch.ino.");
    return;
  }

  // Construct JSON Payload adhering to WorkCheck Telemetry API Schema
  String json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"site_id\":\"" + String(SITE_ID) + "\",";
  json += "\"source\":\"wokwi_simulated\",";
  json += "\"ambient_temp_c\":" + String(airT, 1) + ",";
  json += "\"relative_humidity_pct\":" + String(rh, 0) + ",";
  json += "\"globe_temp_c\":" + String(globeT, 1) + ",";
  json += "\"pm10_0_ug_m3\":" + String(pm10, 1) + ",";
  json += "\"pm2_5_ug_m3\":" + String(pm25, 1) + ",";
  json += "\"uv_index\":" + String(uv, 1) + ",";
  json += "\"noise_dba\":" + String(noise, 1);
  json += "}";

  WiFiClientSecure client;
  client.setInsecure(); // Simulation only; certificate validation bypassed in sandbox

  HTTPClient http;
  if (!http.begin(client, PLATFORM_URL)) {
    Serial.println("HTTP begin failed.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", DEVICE_KEY);

  int httpCode = http.POST(json);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP POST] Code: %d  Payload size: %d bytes\n", httpCode, json.length());

    // Basic reply parsing for lamp status and calculated WBGT
    int lampIdx = response.indexOf("\"lamp\":\"");
    if (lampIdx != -1) {
      int endIdx = response.indexOf("\"", lampIdx + 8);
      currentLamp = response.substring(lampIdx + 8, endIdx);
    }
    int wbgtIdx = response.indexOf("\"wbgt_c\":");
    if (wbgtIdx != -1) {
      lastWbgt = response.substring(wbgtIdx + 9, response.indexOf(",", wbgtIdx)).toFloat();
    }
  } else {
    Serial.printf("[HTTP POST] Error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ---------------------------------------------------------------------------
// Physical Alert Actuator (LED & Buzzer)
// ---------------------------------------------------------------------------
void handleAlertActuators() {
  if (currentLamp == "RED_FLASH" || currentLamp == "RED") {
    digitalWrite(LED_ALERT_PIN, HIGH);
    tone(BUZZER_PIN, 1800, 200); // 1.8 kHz beep for 200ms
  } else if (currentLamp == "ORANGE" || currentLamp == "YELLOW") {
    digitalWrite(LED_ALERT_PIN, HIGH);
    delay(50);
    digitalWrite(LED_ALERT_PIN, LOW);
  } else {
    digitalWrite(LED_ALERT_PIN, LOW);
    noTone(BUZZER_PIN);
  }
}

