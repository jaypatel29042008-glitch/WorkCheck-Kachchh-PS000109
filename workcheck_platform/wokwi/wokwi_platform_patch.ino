// Connects the team's Wokwi sketch to the WorkCheck platform, in both directions.
// Project: https://wokwi.com/projects/479831190538594305
//
// Device to website: each reading is posted to the platform.
// Website to device: the reply carries test values set with the sliders on the website
// (Site monitor > Wokwi device > "Control the device from here"). When that control is ON,
// the device uses those values in place of its own sensors, so its screen, lamp and buzzer
// follow the website, and it reports back which set of values it is using.
//
// Dust and UV are simulated stand-ins, so readings must stay labelled wokwi_simulated.
// See the platform README, "Connect Wokwi", for how to get a public address for PLATFORM_URL.

// 1. Add under  #include <WiFi.h> :
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// 2. Paste this block just above  void setup() { .
const char*    PLATFORM_URL  = "https://YOUR-PUBLIC-ADDRESS/api/v1/telemetry";
const char*    PLATFORM_KEY  = "demo-device-key";   // Must match WC_DEVICE_KEY on the platform.
const uint32_t POST_EVERY_MS = 3000;
uint32_t lastPostMs = 0;

bool  remoteOn = false;
int   remoteRev = 0;
float remoteTemp = 0, remoteRh = 0, remoteGlobe = 0, remotePm10 = 0, remoteUv = 0;

// Reads one number that follows a key in the reply, without a JSON library.
float replyNum(const String& r, const char* key, float fallback) {
  int i = r.indexOf(key);
  if (i < 0) return fallback;
  return r.substring(i + strlen(key)).toFloat();
}

void applyRemote(AirReading& a, GlobeReading& g, DustReading& d, UvReading& u) {
  if (!remoteOn) return;
  a.temp = remoteTemp;  a.humidity = remoteRh;  a.ok = true;
  g.temp = remoteGlobe; g.ok = true;
  d.pm10 = remotePm10;  d.pm25 = remotePm10 * 0.4;  d.ok = true;
  u.index = remoteUv;   u.ok = true;
  Serial.println("WEBSITE CONTROL ON: using values set on the website");
}

void postToPlatform(const AirReading& a, const GlobeReading& g, const DustReading& d, const UvReading& u) {
  if (!a.ok) { Serial.println("POST skipped: no air reading"); return; }
  if (WiFi.status() != WL_CONNECTED) { Serial.println("POST skipped: WiFi offline"); return; }
  String body = String("{\"device_id\":\"wokwi-node-01\",\"site_id\":\"kandla_port\",\"source\":\"wokwi_simulated\"")
    + ",\"ambient_temp_c\":" + String(a.temp, 1)
    + ",\"relative_humidity_pct\":" + String(a.humidity, 0)
    + (g.ok ? ",\"globe_temp_c\":" + String(g.temp, 1) : String(""))
    + (d.ok ? ",\"pm2_5_ug_m3\":" + String(d.pm25, 0) + ",\"pm10_0_ug_m3\":" + String(d.pm10, 0) : String(""))
    + (u.ok ? ",\"uv_index\":" + String(u.index, 1) : String(""))
    + ",\"remote_rev\":" + String(remoteOn ? remoteRev : 0)
    + "}";
  WiFiClientSecure client;
  client.setInsecure();   // Simulation only. A real device must check the certificate.
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(client, PLATFORM_URL)) { Serial.println("POST failed: bad address"); return; }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", PLATFORM_KEY);
  int code = http.POST(body);
  if (code > 0) {
    String reply = http.getString();
    int i = reply.indexOf("\"lamp\":\"");
    String lampName = i >= 0 ? reply.substring(i + 8, reply.indexOf("\"", i + 8)) : String("?");
    remoteOn    = replyNum(reply, "\"r_on\":", 0) > 0.5;
    remoteRev   = (int)replyNum(reply, "\"r_rev\":", 0);
    remoteTemp  = replyNum(reply, "\"r_temp\":", remoteTemp);
    remoteRh    = replyNum(reply, "\"r_rh\":", remoteRh);
    remoteGlobe = replyNum(reply, "\"r_globe\":", remoteGlobe);
    remotePm10  = replyNum(reply, "\"r_pm10\":", remotePm10);
    remoteUv    = replyNum(reply, "\"r_uv\":", remoteUv);
    Serial.printf("POST %d, platform lamp: %s, website control: %s\n", code, lampName.c_str(), remoteOn ? "ON" : "off");
  } else {
    // The first try after start-up can fail with "connection refused". The next one goes through.
    Serial.printf("POST failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
}

// 3. In loop(), add this line straight after  UvReading u = readUV(); :
//    applyRemote(a, g, d, u);

// 4. In loop(), paste this just above  delay(READ_EVERY_MS); :
//    if (millis() - lastPostMs >= POST_EVERY_MS) {
//      lastPostMs = millis();
//      postToPlatform(a, g, d, u);
//    }

// If the secure connection keeps failing in the simulator, plain HTTP also worked in testing:
// change the address to start with http:// and replace the two client lines with
//    WiFiClient client;
// Never do that on a real device: the key and readings would travel unprotected.
