/**
 * ============================================================================
 * CycleGuard — Smart Bicycle Security Firmware
 * Target: ESP32-C3 SuperMini
 * Framework: Arduino / ESP-IDF
 *
 * Physical Pinout:
 *  - SW-420 Vibration Sensor DO -> GPIO 4 (VCC -> 3V3, GND -> GND)
 *  - Active Piezo Buzzer        -> GPIO 5 (Positive -> GPIO 5, Negative -> GND)
 *  - Status LED                 -> GPIO 2 (Anode -> 220R -> GPIO 2, Cathode -> GND)
 *
 * MQTT Topics:
 *  - Command: cycleguard/device/001/command  (Subscribed: ARM, DISARM)
 *  - Status:  cycleguard/device/001/status   (Published: DISARMED, ARMED, ALARM)
 *  - Alert:   cycleguard/device/001/alert    (Published: VIBRATION_DETECTED)
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// Local configuration containing WiFi and MQTT broker credentials (git-ignored)
#if __has_include("config.h")
  #include "config.h"
#else
  #include "config.example.h"
#endif

// ============================================================================
// HARDWARE PIN ASSIGNMENTS
// ============================================================================
#define PIN_SENSOR 4   // SW-420 Digital Output (DO)
#define PIN_BUZZER 5   // Active Buzzer Positive (+)
#define PIN_LED    2   // Status Indicator LED

// ============================================================================
// ALGORITHM & TIMING CONSTANTS
// ============================================================================
const unsigned long CONFIRMATION_WINDOW_MS = 3000; // 3 seconds confirmation window
const int VIBRATION_THRESHOLD              = 3;    // 3 events required to trigger ALARM
const unsigned long DEBOUNCE_INTERVAL_MS   = 100;  // 100 ms debounce between distinct pulses
const unsigned long LED_BLINK_INTERVAL_MS  = 150;  // 150 ms toggle during ALARM
const unsigned long MQTT_RECONNECT_MS      = 5000; // Retry MQTT every 5 seconds
const unsigned long WIFI_RECONNECT_MS      = 10000;// Retry WiFi every 10 seconds

// ============================================================================
// STATE MACHINE
// ============================================================================
enum DeviceState {
  STATE_DISARMED,
  STATE_ARMED,
  STATE_ALARM
};

DeviceState currentState = STATE_DISARMED;
bool securityArmed = false;
bool alarmActive = false;

// Vibration Tracking
int vibrationCount = 0;
unsigned long windowStartTime = 0;
unsigned long lastVibrationEventTime = 0;
int lastSensorPinState = LOW;

// LED Blinking
unsigned long lastLedBlinkTime = 0;
bool ledBlinkState = false;

// Reconnection Timers
unsigned long lastMqttAttempt = 0;
unsigned long lastWifiAttempt = 0;

// Pending Alert Flag (in case alarm triggered while offline)
bool pendingAlertToPublish = false;

// ============================================================================
// MQTT TOPICS & CLIENTS
// ============================================================================
const char* TOPIC_COMMAND = "cycleguard/device/001/command";
const char* TOPIC_STATUS  = "cycleguard/device/001/status";
const char* TOPIC_ALERT   = "cycleguard/device/001/alert";

WiFiClientSecure tlsClient;
PubSubClient mqttClient(tlsClient);

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================
void connectWiFi();
void checkWiFiReconnection();
void connectMQTT();
void checkMQTTReconnection();
void publishStatus(const char* statusPayload);
void publishAlert(const char* alertPayload);
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void enterArmedState();
void enterDisarmedState();
void triggerAlarm();
void processVibrationSensor();
void updateOutputs();

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize GPIOs
  pinMode(PIN_SENSOR, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  // Default power-on state: DISARMED
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);

  currentState = STATE_DISARMED;
  securityArmed = false;
  alarmActive = false;
  vibrationCount = 0;

  Serial.println("\n========================================");
  Serial.println("       CYCLEGUARD ESP32-C3");
  Serial.println("========================================");
  Serial.printf("Device ID: %s\n", DEVICE_ID);

  // TLS Security Configuration
  // EMQX Cloud uses Let's Encrypt / ISRG Root X1 certificates
  tlsClient.setInsecure(); // For prototype ease; switch to tlsClient.setCACert() with ISRG Root X1 if certificate pinning is required

  // Setup MQTT
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setBufferSize(256);

  // Connect to Network & Broker
  connectWiFi();
  connectMQTT();

  Serial.println("\nSTATE: DISARMED\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  unsigned long now = millis();

  // 1. Maintain Network & MQTT Connectivity (non-blocking)
  checkWiFiReconnection();
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      checkMQTTReconnection();
    } else {
      mqttClient.loop();
    }
  }

  // 2. CRUCIAL: Local Vibration Detection runs continuously
  // Works independently of WiFi or MQTT connection!
  if (currentState == STATE_ARMED) {
    processVibrationSensor();
  }

  // 3. Update Hardware Outputs (LED Blinking, Buzzer)
  updateOutputs();
}

// ============================================================================
// VIBRATION DETECTION & CONFIRMATION ALGORITHM
// ============================================================================
/**
 * Monitors SW-420 vibration sensor with debounce & confirmation window.
 *
 * Algorithm:
 *  1. Detect distinct rising-edge pulses with a 100 ms debounce.
 *  2. On first pulse, start a 3000 ms confirmation window.
 *  3. Increment counter for each subsequent distinct pulse.
 *  4. If counter reaches 3 pulses within 3000 ms -> enter ALARM state.
 *  5. If 3000 ms elapses before reaching 3 pulses -> reset counter to 0.
 */
void processVibrationSensor() {
  int currentPinState = digitalRead(PIN_SENSOR);
  unsigned long now = millis();

  // Detect edge transition from LOW to HIGH
  if (currentPinState == HIGH && lastSensorPinState == LOW) {
    if (now - lastVibrationEventTime >= DEBOUNCE_INTERVAL_MS) {
      lastVibrationEventTime = now;

      // Start new confirmation window if this is the first pulse or if previous window expired
      if (vibrationCount == 0 || (now - windowStartTime >= CONFIRMATION_WINDOW_MS)) {
        windowStartTime = now;
        vibrationCount = 1;
        Serial.printf("VIBRATION EVENT: %d\n", vibrationCount);
      } else {
        vibrationCount++;
        Serial.printf("VIBRATION EVENT: %d\n", vibrationCount);
      }

      // Check if threshold reached
      if (vibrationCount >= VIBRATION_THRESHOLD) {
        Serial.println("\n!!! SUSPICIOUS MOVEMENT !!!");
        triggerAlarm();
      }
    }
  }
  lastSensorPinState = currentPinState;

  // Window timeout expiration: reset count if 3 seconds elapse without reaching threshold
  if (vibrationCount > 0 && (now - windowStartTime >= CONFIRMATION_WINDOW_MS)) {
    vibrationCount = 0;
  }
}

// ============================================================================
// HARDWARE OUTPUT MANAGEMENT
// ============================================================================
void updateOutputs() {
  unsigned long now = millis();

  switch (currentState) {
    case STATE_DISARMED:
      digitalWrite(PIN_BUZZER, LOW);
      digitalWrite(PIN_LED, LOW);
      break;

    case STATE_ARMED:
      digitalWrite(PIN_BUZZER, LOW);
      digitalWrite(PIN_LED, HIGH); // Continuously ON when armed
      break;

    case STATE_ALARM:
      digitalWrite(PIN_BUZZER, HIGH); // Continuously ON during alarm

      // Non-blocking LED blinking (150 ms toggle)
      if (now - lastLedBlinkTime >= LED_BLINK_INTERVAL_MS) {
        lastLedBlinkTime = now;
        ledBlinkState = !ledBlinkState;
        digitalWrite(PIN_LED, ledBlinkState ? HIGH : LOW);
      }
      break;
  }
}

// ============================================================================
// STATE TRANSITIONS
// ============================================================================
/**
 * Transition to ARMED state.
 */
void enterArmedState() {
  currentState = STATE_ARMED;
  securityArmed = true;
  alarmActive = false;
  vibrationCount = 0;
  windowStartTime = 0;
  lastVibrationEventTime = 0;

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, HIGH);

  Serial.println("========================================");
  Serial.println("MQTT COMMAND");
  Serial.println("========================================");
  Serial.println("Command: ARM\n");
  Serial.println("STATE: ARMED");
  Serial.println("LED: ON");
  Serial.println("BUZZER: OFF\n");

  publishStatus("ARMED");
}

/**
 * Transition to DISARMED state.
 * Immediately stops alarm, turns buzzer & LED OFF, and resets counters.
 */
void enterDisarmedState() {
  currentState = STATE_DISARMED;
  securityArmed = false;
  alarmActive = false;
  vibrationCount = 0;
  windowStartTime = 0;
  lastVibrationEventTime = 0;
  pendingAlertToPublish = false;

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);

  Serial.println("\nCommand: DISARM\n");
  Serial.println("STATE: DISARMED");
  Serial.println("BUZZER: OFF");
  Serial.println("LED: OFF\n");

  publishStatus("DISARMED");
}

/**
 * Transition to ALARM state upon confirmed vibration.
 * Activates local buzzer & blinking LED, then publishes alert & status.
 */
void triggerAlarm() {
  currentState = STATE_ALARM;
  alarmActive = true;
  vibrationCount = 0;

  digitalWrite(PIN_BUZZER, HIGH);

  Serial.println("STATE: ALARM");
  Serial.println("BUZZER: ON");
  Serial.println("LED: BLINKING");
  Serial.println("ALERT: VIBRATION_DETECTED\n");

  // Publish exactly one alert event
  publishAlert("VIBRATION_DETECTED");

  // Publish updated status
  publishStatus("ALARM");
}

// ============================================================================
// MQTT MESSAGE HANDLER
// ============================================================================
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  // Extract command from plain string or JSON
  String cmd = message;
  if (message.indexOf("ARM") >= 0 && message.indexOf("DISARM") < 0) {
    cmd = "ARM";
  } else if (message.indexOf("DISARM") >= 0) {
    cmd = "DISARM";
  }

  cmd.toUpperCase();

  if (cmd == "ARM") {
    enterArmedState();
  } else if (cmd == "DISARM") {
    enterDisarmedState();
  }
}

// ============================================================================
// MQTT PUBLISH HELPERS
// ============================================================================
void publishStatus(const char* statusPayload) {
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_STATUS, statusPayload, true); // Retained status
    Serial.printf("[MQTT] Status published -> %s\n", statusPayload);
  }
}

void publishAlert(const char* alertPayload) {
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_ALERT, alertPayload, false);
    Serial.printf("[MQTT] Alert published  -> %s\n", alertPayload);
  } else {
    // If offline when alarm triggered, mark pending to publish as soon as reconnected
    pendingAlertToPublish = true;
  }
}

// ============================================================================
// WIFI CONNECTION & RECONNECT
// ============================================================================
void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start < 8000)) {
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] Could not connect immediately. Retrying in background...");
  }
}

void checkWiFiReconnection() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiAttempt >= WIFI_RECONNECT_MS) {
      lastWifiAttempt = now;
      Serial.println("[WiFi] Reconnecting...");
      WiFi.reconnect();
    }
  }
}

// ============================================================================
// MQTT CONNECTION & RECONNECT
// ============================================================================
void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  Serial.println("Connecting to EMQX...");

  String clientId = String("cycleguard-esp32-") + DEVICE_ID;
  const char* lwtPayload = "DISARMED";

  // Last Will and Testament: if connection drops abruptly, broker retains DISARMED/OFFLINE
  if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
                         TOPIC_STATUS, 1, true, lwtPayload)) {
    Serial.println("MQTT connected\n");

    // Subscribe to command topic
    mqttClient.subscribe(TOPIC_COMMAND, 1);
    Serial.println("Subscribed:");
    Serial.println(TOPIC_COMMAND);

    // Publish current state on connect
    const char* currentPayload = (currentState == STATE_ARMED) ? "ARMED" :
                                 (currentState == STATE_ALARM) ? "ALARM" : "DISARMED";
    publishStatus(currentPayload);

    // If an alert was triggered while offline, deliver it now
    if (pendingAlertToPublish) {
      pendingAlertToPublish = false;
      publishAlert("VIBRATION_DETECTED");
    }
  } else {
    Serial.printf("[MQTT] Connection failed (rc=%d). Retrying in 5s...\n", mqttClient.state());
  }
}

void checkMQTTReconnection() {
  unsigned long now = millis();
  if (!mqttClient.connected()) {
    if (now - lastMqttAttempt >= MQTT_RECONNECT_MS) {
      lastMqttAttempt = now;
      connectMQTT();
    }
  }
}
