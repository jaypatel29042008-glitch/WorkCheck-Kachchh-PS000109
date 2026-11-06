// Adds platform connection to a copy of the team's Wokwi sketch.
// Use a copy of https://wokwi.com/projects/479831190538594305. Nothing here has run on Wokwi yet.
// Readings are simulated and must stay labelled wokwi_simulated.

// 1. Add near the other includes:
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// 2. Add near the other constants. Use the platform's public HTTPS address.
const char* PLATFORM_URL = "https://YOUR-PUBLIC-ADDRESS/api/v1/telemetry";
const char* DEVICE_KEY   = "demo-device-key";  // Replace before sharing the address.
const uint32_t SEND_EVERY_MS = 5000;
uint32_t lastSendMs = 0;

// 3. Add above setup():
void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin("Wokwi-GUEST", "", 6);
  Serial.print("WiFi");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " failed");
}

void sendReading(const AirReading& a, const GlobeReading& g, const DustReading& d, const UvReading& u) {
  // A failed air sensor reading can't produce a useful record, so skip it.
  if (!a.ok || WiFi.status() != WL_CONNECTED) return;
  String body = String("{\"device_id\":\"wokwi-node-01\",\"site_id\":\"kandla_port\",\"source\":\"wokwi_simulated\"")
    + ",\"ambient_temp_c\":" + String(a.temp, 1)
    + ",\"relative_humidity_pct\":" + String(a.humidity, 0)
    + (g.ok ? ",\"globe_temp_c\":" + String(g.temp, 1) : String(""))
    + (d.ok ? ",\"pm2_5_ug_m3\":" + String(d.pm25, 0) + ",\"pm10_0_ug_m3\":" + String(d.pm10, 0) : String(""))
    + ",\"uv_index\":" + String(u.index, 1) + "}";
  WiFiClientSecure client;
  client.setInsecure();  // Simulation only. Verify certificates on real devices.
  HTTPClient http;
  http.begin(client, PLATFORM_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", DEVICE_KEY);
  int code = http.POST(body);
  Serial.printf("Platform reply: %d\n", code);
  http.end();
}

// 4. Add to the end of setup():
//    connectWifi();

// 5. Add inside loop(), just before delay(READ_EVERY_MS):
//    if (millis() - lastSendMs >= SEND_EVERY_MS) {
//      lastSendMs = millis();
//      connectWifi();
//      sendReading(a, g, d, u);
//    }
