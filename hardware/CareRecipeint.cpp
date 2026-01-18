/* ESP32 Device A – CareSync Sender
 * Sends feedback to:
 *  1. Device B (UDP) – instant caregiver notification
 *  2. Backend API (HTTP POST) – logs to Firestore
 *  3. Laptop UDP (optional local debugging)
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <time.h>

void sendHeartbeat();
void syncTime();
void connectWiFi();
void sendFeedback(int id, const char* label, bool r, bool g, bool b);
void sendToBackend(const char* label);
String getTimestamp();
void allOff();
void flashColor(bool r, bool g, bool b);

// ======== CONFIG ========
const char* WIFI_SSID = "AndroidAP";
const char* WIFI_PASSWORD = "yecg5819";

// Backend
const char* BACKEND_BASE = "http://192.168.142.184:8080";
const char* EVENT_URL = "/api/event";
const char* HEARTBEAT_URL = "/api/heartbeat";
const char* DEVICE_ID = "Care Recipient";

// UDP setup
WiFiUDP udp;
const int LOCAL_UDP_PORT = 4210;

// UDP destinations
IPAddress DEVICE_B_IP(192, 168, 142, 168);
const int DEVICE_B_PORT = 4210;

IPAddress LAPTOP_IP(192, 168, 142, 112);
const int LAPTOP_PORT = 4200;

// Buttons
#define BUTTON_TIRED   16
#define BUTTON_SPACE   4
#define BUTTON_COMPANY 23
#define BUTTON_PAIN    17
#define BUTTON_MUSIC   22

// RGB LED (COMMON CATHODE)
#define LED_RED        21
#define LED_GREEN      19
#define LED_BLUE       18

// ======== STATE ========
bool lastButtonTired = HIGH;
bool lastButtonSpace = HIGH;
bool lastButtonCompany = HIGH;
bool lastButtonPain = HIGH;
bool lastButtonMusic = HIGH;
unsigned long lastHeartbeat = 0;
bool isFlashing = false;

// ======== SETUP ========
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Pin setup
  pinMode(BUTTON_TIRED, INPUT_PULLUP);
  pinMode(BUTTON_SPACE, INPUT_PULLUP);
  pinMode(BUTTON_COMPANY, INPUT_PULLUP);
  pinMode(BUTTON_PAIN, INPUT_PULLUP);
  pinMode(BUTTON_MUSIC, INPUT_PULLUP);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  allOff();

  // Connect WiFi
  connectWiFi();
  udp.begin(LOCAL_UDP_PORT);
  syncTime();

  Serial.println("\nDevice A Ready!");
  Serial.printf("Device IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Backend:   %s\n\n", BACKEND_BASE);
}

// ======== MAIN LOOP ========
void loop() {
  if (isFlashing) {
    delay(10);
    return;
  }

  // Send heartbeat every 30s
  if (millis() - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  bool btnTired = digitalRead(BUTTON_TIRED);
  bool btnSpace = digitalRead(BUTTON_SPACE);
  bool btnCompany = digitalRead(BUTTON_COMPANY);
  bool btnPain = digitalRead(BUTTON_PAIN);
  bool btnMusic = digitalRead(BUTTON_MUSIC);

  if (btnTired == LOW && lastButtonTired == HIGH) {
    sendFeedback(1, "tired", true, false, false);
    delay(50);
  }
  lastButtonTired = btnTired;

  if (btnSpace == LOW && lastButtonSpace == HIGH) {
    sendFeedback(2, "space", true, true, false);
    delay(50);
  }
  lastButtonSpace = btnSpace;

  if (btnCompany == LOW && lastButtonCompany == HIGH) {
    sendFeedback(3, "company", false, true, false);
    delay(50);
  }
  lastButtonCompany = btnCompany;

  if (btnPain == LOW && lastButtonPain == HIGH) {
    sendFeedback(4, "pain", false, false, true);
    delay(50);
  }
  lastButtonPain = btnPain;

  if (btnMusic == LOW && lastButtonMusic == HIGH) {
    sendFeedback(5, "music", false, true, true);
    delay(50);
  }
  lastButtonMusic = btnMusic;

  delay(10);
}

// ======== FUNCTIONS ========

void connectWiFi() {
  Serial.printf("Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 5) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi Failed. Aborting...");
    while (1) {
      delay(1000);
    }
  }
  Serial.println("\nWiFi Connected!");
}

void syncTime() {
  configTime(8 * 3600, 0, "pool.ntp.org"); // SG timezone
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to sync time");
  }
}

void allOff() {
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_BLUE, LOW);
}

void flashColor(bool r, bool g, bool b) {
  for (int i = 0; i < 3; i++) {
    allOff();
    if (r) digitalWrite(LED_RED, HIGH);
    if (g) digitalWrite(LED_GREEN, HIGH);
    if (b) digitalWrite(LED_BLUE, HIGH);
    delay(200);
    allOff();
    delay(200);
  }
}

void sendFeedback(int id, const char* label, bool r, bool g, bool b) {
  if (isFlashing) return;
  isFlashing = true;

  // Message for UDP (Device B expects "BUTTON_ID:COLOR")
  char message[50];
  sprintf(message, "%d:%s", id, label);
  const char* color = "UNKNOWN";
  if (id == 1) {
    color = "RED";
  } else if (id == 2) {
    color = "YELLOW";
  } else if (id == 3) {
    color = "GREEN";
  } else if (id == 4) {
    color = "BLUE";
  } else if (id == 5) {
    color = "CYAN";
  }
  char deviceBMessage[32];
  sprintf(deviceBMessage, "%d:%s", id, color);

  flashColor(r, g, b);

  // Send UDP → Device B
  udp.beginPacket(DEVICE_B_IP, DEVICE_B_PORT);
  udp.print(deviceBMessage);
  udp.endPacket();

  // Send UDP → Laptop (debug)
  udp.beginPacket(LAPTOP_IP, LAPTOP_PORT);
  udp.print(message);
  udp.endPacket();

  // Send HTTP → Backend
  sendToBackend(label);

  Serial.printf("[Button] %s → sent to Device B + Backend\n", label);
  isFlashing = false;
}

void sendToBackend(const char* label) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(BACKEND_BASE) + EVENT_URL;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + String(DEVICE_ID) +
                "\",\"label\":\"" + String(label) +
                "\",\"timestamp\":\"" + getTimestamp() + "\"}";
  int code = http.POST(body);
  Serial.printf("POST /api/event [%d]\n", code);
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(BACKEND_BASE) + HEARTBEAT_URL;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"device_id\":\"" + String(DEVICE_ID) + "\"}";
  int code = http.POST(body);
  Serial.printf("POST /api/heartbeat [%d]\n", code);
  http.end();
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00Z";
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}
