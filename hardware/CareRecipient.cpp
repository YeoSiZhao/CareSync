/* ESP32 Device A – CareSync Sender
 * Sends feedback to:
 *  1. Device B (UDP) – instant caregiver notification
 *  2. Backend API (HTTP POST) – logs to Firestore
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
IPAddress DEVICE_B_IP(192, 168, 142, 195);
const int DEVICE_B_PORT = 4210;

// Buttons
#define BUTTON_TIRED   16
#define BUTTON_SPACE   4
#define BUTTON_COMPANY 13
#define BUTTON_PAIN    17
#define BUTTON_MUSIC   26

// RGB LED (COMMON CATHODE)
#define LED_RED        27
#define LED_GREEN      33
#define LED_BLUE       32

// ======== STATE ========
unsigned long lastHeartbeat = 0;
bool isFlashing = false;

// Interrupt flags and debounce - IMPROVED
volatile bool buttonPressed = false;
volatile int lastButtonId = 0;
volatile unsigned long lastDebounceTime = 0;  // Made volatile for ISR safety
const unsigned long debounceDelay = 150; // 100ms for faster response

// ISR handlers - IMPROVED
void IRAM_ATTR handleButtonTired() {
  unsigned long currentTime = millis();
  if (currentTime - lastDebounceTime > debounceDelay) {
    lastButtonId = 1;
    buttonPressed = true;
    lastDebounceTime = currentTime;
  }
}

void IRAM_ATTR handleButtonSpace() {
  unsigned long currentTime = millis();
  if (currentTime - lastDebounceTime > debounceDelay) {
    lastButtonId = 2;
    buttonPressed = true;
    lastDebounceTime = currentTime;
  }
}

void IRAM_ATTR handleButtonCompany() {
  unsigned long currentTime = millis();
  if (currentTime - lastDebounceTime > debounceDelay) {
    lastButtonId = 3;
    buttonPressed = true;
    lastDebounceTime = currentTime;
  }
}

void IRAM_ATTR handleButtonPain() {
  unsigned long currentTime = millis();
  if (currentTime - lastDebounceTime > debounceDelay) {
    lastButtonId = 4;
    buttonPressed = true;
    lastDebounceTime = currentTime;
  }
}

void IRAM_ATTR handleButtonMusic() {
  unsigned long currentTime = millis();
  if (currentTime - lastDebounceTime > debounceDelay) {
    lastButtonId = 5;
    buttonPressed = true;
    lastDebounceTime = currentTime;
  }
}

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

  // Attach interrupts (FALLING = button press on INPUT_PULLUP)
  attachInterrupt(digitalPinToInterrupt(BUTTON_TIRED), handleButtonTired, FALLING);
  attachInterrupt(digitalPinToInterrupt(BUTTON_SPACE), handleButtonSpace, FALLING);
  attachInterrupt(digitalPinToInterrupt(BUTTON_COMPANY), handleButtonCompany, FALLING);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PAIN), handleButtonPain, FALLING);
  attachInterrupt(digitalPinToInterrupt(BUTTON_MUSIC), handleButtonMusic, FALLING);

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
  // Send heartbeat every 30s
  if (millis() - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // Handle button press from interrupt
  if (buttonPressed && !isFlashing) {
    buttonPressed = false;
    
    switch(lastButtonId) {
      case 1:
        sendFeedback(1, "tired", true, false, false);
        break;
      case 2:
        sendFeedback(2, "space", true, true, false);
        break;
      case 3:
        sendFeedback(3, "company", false, true, false);
        break;
      case 4:
        sendFeedback(4, "pain", false, false, true);
        break;
      case 5:
        sendFeedback(5, "music", false, true, true);
        break;
    }
  }

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
  configTime(8 * 3600, 0, "pool.ntp.org"); // UTC+8
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

  // Print immediately
  // Serial.printf("[Button] %s pressed\n", label);

  // Flash color AFTER sending (visual confirmation)
  flashColor(r, g, b);

  // Send UDP → Device B (FIRST - most critical for instant notification)
  udp.beginPacket(DEVICE_B_IP, DEVICE_B_PORT);
  udp.print(deviceBMessage);
  udp.endPacket();

  // Send HTTP → Backend (slowest, done last)
  sendToBackend(label);

  // Serial.printf("[Sent] %s to Device B\n", color);
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
  // Serial.printf("POST /api/event [%d]\n", code);
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
  // Serial.printf("POST /api/heartbeat [%d]\n", code);
  http.end();
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00+08:00";
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+08:00", &timeinfo);
  return String(buf);
}