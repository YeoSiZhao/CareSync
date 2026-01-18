/*
 * ESP32 Device B - RECEIVER (Caregiver Notification Device)
 * Receives real-time feedback from Device A
 * Uses RGB LED with flashing logic and FreeRTOS task
 */

#include <WiFi.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>

// WiFi credentials
const char* WIFI_SSID = "AndroidAP";
const char* WIFI_PASSWORD = "yecg5819";

// Backend
const char* BACKEND_BASE = "http://192.168.142.184:8080";
const char* HEARTBEAT_URL = "/api/heartbeat";
const char* DEVICE_ID = "Caregiver";

// RGB LED PINS (COMMON ANODE)
const int RED_PIN = 23;
const int GREEN_PIN = 22;
const int BLUE_PIN = 21;

// UDP
WiFiUDP udp;
const int UDP_PORT = 4210;

// FLASH CONFIG
const int FLASH_COUNT = 3;
const int FLASH_ON_MS = 200;
const int FLASH_OFF_MS = 200;

// TASK/QUEUE
QueueHandle_t msgQueue;
TaskHandle_t udpTaskHandle = NULL;

unsigned long lastHeartbeat = 0;

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

// ===== LED CONTROL =====
void allOff() {
  digitalWrite(RED_PIN, LOW);
  digitalWrite(GREEN_PIN, LOW);
  digitalWrite(BLUE_PIN, LOW);
}

void flashColor(bool r, bool g, bool b) {
  for (int i = 0; i < FLASH_COUNT; i++) {
    allOff();
    if (r) digitalWrite(RED_PIN, HIGH);
    if (g) digitalWrite(GREEN_PIN, HIGH);
    if (b) digitalWrite(BLUE_PIN, HIGH);
    delay(FLASH_ON_MS);

    allOff();
    delay(FLASH_OFF_MS);
  }
}

// ===== UDP RECEIVER TASK (runs independently) =====
void udpReceiverTask(void *parameter) {
  char buf[255];

  while (true) {
    if (millis() - lastHeartbeat > 30000) {
      sendHeartbeat();
      lastHeartbeat = millis();
    }

    int packetSize = udp.parsePacket();

    if (packetSize > 0) {
      int len = udp.read(buf, sizeof(buf) - 1);
      if (len > 0) {
        buf[len] = '\0';

        Serial.println("\n========================================");
        Serial.println("FEEDBACK RECEIVED FROM ELDERLY");
        Serial.println("========================================");
        Serial.printf("From: %s:%d\n", udp.remoteIP().toString().c_str(), udp.remotePort());
        Serial.printf("Raw message: %s\n", buf);

        // Parse message format: "BUTTON_ID:COLOR"
        String msg = String(buf);
        msg.trim();

        int colonPos = msg.indexOf(':');
        if (colonPos > 0) {
          String buttonId = msg.substring(0, colonPos);
          String color = msg.substring(colonPos + 1);

          Serial.printf("Parsed: Button %s (%s)\n", buttonId.c_str(), color.c_str());

          // Send color to queue for LED flashing
          char msgCopy[32];
          color.toCharArray(msgCopy, sizeof(msgCopy));
          xQueueSend(msgQueue, &msgCopy, 0);

          // Print feedback meaning
          if (color == "RED") {
            Serial.println("\nRED: Tired");
            Serial.println("   Action: Offer rest and check in");
          }
          else if (color == "YELLOW") {
            Serial.println("\nYELLOW: Space");
            Serial.println("   Action: Give space but stay available");
          }
          else if (color == "GREEN") {
            Serial.println("\nGREEN: Company");
            Serial.println("   Action: Provide company and engage");
          }
          else if (color == "BLUE") {
            Serial.println("\nBLUE: Pain");
            Serial.println("   Action: Check for pain and provide help");
          }
          else if (color == "CYAN") {
            Serial.println("\nCYAN: Music");
            Serial.println("   Action: Play music or offer entertainment");
          }
        } else {
          Serial.println("Warning: Could not parse message format");
        }

        Serial.println("========================================\n");
      }
    }

    // Small delay to prevent task from hogging CPU
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // Force LOW state BEFORE enabling output (prevents boot glow)
  digitalWrite(RED_PIN, LOW);
  digitalWrite(GREEN_PIN, LOW);
  digitalWrite(BLUE_PIN, LOW);

  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  // Enable internal pulldowns (kills leakage completely)
  gpio_pulldown_en((gpio_num_t)RED_PIN);
  gpio_pulldown_en((gpio_num_t)GREEN_PIN);
  gpio_pulldown_en((gpio_num_t)BLUE_PIN);

  allOff();

  // Connect to WiFi
  Serial.println("\n========================================");
  Serial.println("  Device B - Caregiver Alert Device");
  Serial.println("========================================");
  Serial.println("Connecting to WiFi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 5) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n\n*** WIFI CONNECTION FAILED ***");
    Serial.println("Check hotspot is on and credentials are correct!");
    while(1) {
      delay(1000);
    }
  }

  Serial.println("\n\nWiFi Connected Successfully!");
  Serial.println("========================================");
  Serial.print("Device B IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.println("========================================");
  Serial.println("\n*** UPDATE DEVICE A CODE WITH THIS IP ***\n");

  // Start UDP
  udp.begin(UDP_PORT);
  Serial.printf("Listening for feedback on UDP port %d\n\n", UDP_PORT);

  // CREATE QUEUE
  msgQueue = xQueueCreate(10, sizeof(char) * 32);
  if (msgQueue == NULL) {
    Serial.println("[ERROR] Failed to create queue!");
    while (1) {
      delay(1000);
    }
  }

  // CREATE UDP RECEIVER TASK
  xTaskCreatePinnedToCore(
    udpReceiverTask,    // Task function
    "UDP_Receiver",     // Task name
    4096,               // Stack size (bytes)
    NULL,               // Parameters
    2,                  // Priority (higher = more priority)
    &udpTaskHandle,     // Task handle
    0                   // Core (0 or 1, use 0 to avoid WiFi core)
  );

  Serial.println("Device B Ready!");
  Serial.println("UDP receiver task started on Core 0");
  Serial.println("Waiting for feedback from Device A...\n");

  // Flash all colors to show ready
  flashColor(true, false, false);   // Red
  delay(300);
  flashColor(true, true, false);    // Yellow
  delay(300);
  flashColor(false, true, false);   // Green
  delay(300);

  allOff();
}

void loop() {
  char receivedMsg[32];

  // Wait for message from queue (blocking, but efficient)
  if (xQueueReceive(msgQueue, &receivedMsg, portMAX_DELAY) == pdTRUE) {
    String msg = String(receivedMsg);

    Serial.print("[MAIN] Processing LED flash for: ");
    Serial.println(msg);

  if (msg == "RED") {
      flashColor(true, false, false);   // Red only
    } 
    else if (msg == "YELLOW") {
      flashColor(true, true, false);    // Red + Green = Yellow
    } 
    else if (msg == "GREEN") {
      flashColor(false, true, false);   // Green only
    }
    else if (msg == "BLUE") {
      flashColor(false, false, true);   // Blue only
    }
    else if (msg == "CYAN") {
      flashColor(false, true, true);    // Green + Blue = Cyan
    }

    allOff();
    Serial.println("[MAIN] Flash complete, ready for next message\n");
  }
}
