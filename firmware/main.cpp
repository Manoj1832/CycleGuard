/**
 * CycleGuard — Smart Bicycle Security Firmware
 * Platform: ESP32-C3 / ESP32 (Arduino Framework)
 *
 * Hardware Components:
 *  - SW-420 Vibration Sensor -> GPIO 4
 *  - Active Piezo Buzzer     -> GPIO 5
 *  - Status LED              -> GPIO 2
 *
 * Protocols:
 *  - MQTT over TLS (Port 8883) to EMQX Cloud
 *  - Subscribes to: cycleguard/device/{DEVICE_ID}/command
 *  - Publishes to:  cycleguard/device/{DEVICE_ID}/status (retained heartbeat & confirmation)
 *                   cycleguard/device/{DEVICE_ID}/alert  (vibration trigger events)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#if __has_include("config.h")
  #include "config.h"
#else
  #include "config.example.h"
#endif

// ---- Pin Definitions ----
#define PIN_SENSOR 4   // SW-420 Digital Out
#define PIN_BUZZER 5   // Active Buzzer Positive
#define PIN_LED    2   // Status Indicator LED

// ---- Device State ----
enum SecurityState {
  STATE_OFF,
  STATE_ARMED,
  STATE_ALARM
};

SecurityState currentState = STATE_OFF;
bool alarmActive = false;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

// MQTT Topics
String topicCommand;
String topicStatus;
String topicAlert;

// Network Clients
WiFiClientSecure tlsClient;
PubSubClient mqttClient(tlsClient);

// Forward Declarations
void connectWiFi();
void connectMQTT();
void publishStatus(bool retained = true);
void publishAlert(const char* eventType);
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void handleArm();
void handleDisarm();
void triggerAlarm();
void soundChirp(int count);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==================================");
  Serial.println("  CycleGuard ESP32 Security Node  ");
  Serial.printf("  Device ID: %s\n", DEVICE_ID);
  Serial.println("==================================");

  // Initialize GPIO
  pinMode(PIN_SENSOR, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);

  // Build MQTT topic strings
  topicCommand = String("cycleguard/device/") + DEVICE_ID + "/command";
  topicStatus  = String("cycleguard/device/") + DEVICE_ID + "/status";
  topicAlert   = String("cycleguard/device/") + DEVICE_ID + "/alert";

  // Startup chirp
  soundChirp(1);

  // Configure TLS
  tlsClient.setInsecure(); // Skip CA cert validation for prototype ease; replace with root CA for strict pinning

  // Configure MQTT
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(512);

  // Connect
  connectWiFi();
  connectMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMQTT();
  } else {
    mqttClient.loop();
  }

  // ---- Periodic Heartbeat ----
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = millis();
    if (mqttClient.connected()) {
      publishStatus(true);
    }
  }

  // ---- Sensor & Alarm Monitor ----
  if (currentState == STATE_ARMED) {
    // Check vibration sensor
    int motion = digitalRead(PIN_SENSOR);
    if (motion == HIGH) {
      Serial.println("[Sensor] Motion/Vibration detected!");
      triggerAlarm();
    }
  }

  // Siren effect during active alarm
  if (alarmActive) {
    digitalWrite(PIN_BUZZER, HIGH);
    digitalWrite(PIN_LED, HIGH);
    delay(150);
    digitalWrite(PIN_BUZZER, LOW);
    digitalWrite(PIN_LED, LOW);
    delay(150);
  }

  delay(20);
}

/**
 * Connect to WiFi network.
 */
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
    digitalWrite(PIN_LED, currentState == STATE_ARMED ? HIGH : LOW);
  } else {
    Serial.println("\n[WiFi] Connection timeout. Retrying in background...");
  }
}

/**
 * Connect to EMQX Cloud MQTT broker with LWT (Last Will and Testament).
 */
void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  Serial.print("[MQTT] Connecting to broker...");

  String clientId = String("cycleguard-esp32-") + DEVICE_ID;
  String lwtPayload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"status\":\"OFFLINE\"}";

  // Last Will and Testament: if device drops, broker publishes OFFLINE with retain: true
  if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
                         topicStatus.c_str(), 1, true, lwtPayload.c_str())) {
    Serial.println(" connected!");

    // Subscribe to commands
    mqttClient.subscribe(topicCommand.c_str(), 1);
    Serial.printf("[MQTT] Subscribed to %s\n", topicCommand.c_str());

    // Publish online status immediately
    publishStatus(true);
  } else {
    Serial.printf(" failed, rc=%d. Will retry...\n", mqttClient.state());
    delay(2000);
  }
}

/**
 * Publish status message to MQTT.
 */
void publishStatus(bool retained) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["status"] = "ONLINE";

  switch (currentState) {
    case STATE_ARMED:
      doc["securityState"] = "ON";
      break;
    case STATE_ALARM:
      doc["securityState"] = "ALARM";
      break;
    case STATE_OFF:
    default:
      doc["securityState"] = "OFF";
      break;
  }

  doc["alarmActive"] = alarmActive;

  char buffer[256];
  serializeJson(doc, buffer);

  mqttClient.publish(topicStatus.c_str(), buffer, retained);
  Serial.printf("[MQTT] Published Status: %s\n", buffer);
}

/**
 * Publish alert message to MQTT.
 */
void publishAlert(const char* eventType) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["event"] = eventType;
  doc["timestamp"] = millis();

  char buffer[256];
  serializeJson(doc, buffer);

  mqttClient.publish(topicAlert.c_str(), buffer, false);
  Serial.printf("[MQTT] Published Alert: %s\n", buffer);
}

/**
 * Handle incoming MQTT command.
 */
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  Serial.printf("[MQTT] Message on %s: %s\n", topic, message.c_str());

  String cmd = "";

  // Try parsing JSON: {"command":"ARM"}
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (!err && doc.containsKey("command")) {
    cmd = doc["command"].as<String>();
  } else {
    // Fallback: plain string payload "ARM" or "DISARM"
    cmd = message;
  }

  cmd.toUpperCase();

  if (cmd == "ARM") {
    handleArm();
  } else if (cmd == "DISARM") {
    handleDisarm();
  } else {
    Serial.printf("[Command] Unknown command: %s\n", cmd.c_str());
  }
}

/**
 * Arm bicycle security.
 */
void handleArm() {
  Serial.println("[Security] Bicycle ARMED");
  currentState = STATE_ARMED;
  alarmActive = false;
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, HIGH);

  // Beep once for armed
  soundChirp(1);

  // Send immediate status confirmation
  publishStatus(true);
}

/**
 * Disarm bicycle security.
 */
void handleDisarm() {
  Serial.println("[Security] Bicycle DISARMED");
  currentState = STATE_OFF;
  alarmActive = false;
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);

  // Beep twice for disarmed
  soundChirp(2);

  // Send immediate status confirmation
  publishStatus(true);
}

/**
 * Trigger active security alarm on vibration.
 */
void triggerAlarm() {
  currentState = STATE_ALARM;
  alarmActive = true;

  // Publish movement alert and alarm status
  publishAlert("MOVEMENT_DETECTED");
  publishStatus(true);
}

/**
 * Sound chirps on buzzer.
 */
void soundChirp(int count) {
  for (int i = 0; i < count; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(80);
    digitalWrite(PIN_BUZZER, LOW);
    if (i < count - 1) delay(80);
  }
}
