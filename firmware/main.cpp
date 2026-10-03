/**
 * CycleGuard — Smart Bicycle Security Firmware
 * ESP32-C3 / Arduino Framework
 *
 * Hardware:
 *   SW-420 DO -> GPIO4
 *   Active Buzzer -> GPIO5
 *   LED -> GPIO2 through 220Ω resistor
 *
 * MQTT:
 *   command -> cycleguard/device/{DEVICE_ID}/command
 *   status  -> cycleguard/device/{DEVICE_ID}/status
 *   alert   -> cycleguard/device/{DEVICE_ID}/alert
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


// =====================================================
// GPIO
// =====================================================

#define PIN_SENSOR 4
#define PIN_BUZZER 5
#define PIN_LED    2


// =====================================================
// Security States
// =====================================================

enum SecurityState {
  STATE_OFF,
  STATE_ARMED,
  STATE_ALARM
};

SecurityState currentState = STATE_OFF;


// =====================================================
// Alarm Variables
// =====================================================

bool alarmActive = false;

int vibrationCount = 0;

unsigned long vibrationWindowStart = 0;
unsigned long lastVibrationEvent = 0;

const unsigned long VIBRATION_WINDOW = 3000;
const unsigned long VIBRATION_DEBOUNCE = 250;

const int VIBRATION_THRESHOLD = 3;


// =====================================================
// LED / Buzzer Timing
// =====================================================

unsigned long lastAlarmToggle = 0;

bool alarmOutputState = false;

const unsigned long ALARM_TOGGLE_INTERVAL = 150;


// =====================================================
// Heartbeat
// =====================================================

unsigned long lastHeartbeat = 0;

const unsigned long HEARTBEAT_INTERVAL = 30000;


// =====================================================
// MQTT Topics
// =====================================================

String topicCommand;
String topicStatus;
String topicAlert;


// =====================================================
// Network
// =====================================================

WiFiClientSecure tlsClient;

PubSubClient mqttClient(tlsClient);


// =====================================================
// Function Declarations
// =====================================================

void connectWiFi();
void connectMQTT();

void publishStatus(bool retained = true);
void publishAlert(const char* eventType);

void onMqttMessage(
  char* topic,
  byte* payload,
  unsigned int length
);

void handleArm();
void handleDisarm();

void processVibration();
void triggerAlarm();
void processAlarmOutputs();

void resetVibrationDetection();

void soundChirp(int count);


// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("========================================");
  Serial.println("       CYCLEGUARD ESP32-C3");
  Serial.printf("       Device ID: %s\n", DEVICE_ID);
  Serial.println("========================================");


  // ---------------------------------------------------
  // GPIO
  // ---------------------------------------------------

  pinMode(PIN_SENSOR, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED, LOW);


  // ---------------------------------------------------
  // MQTT Topics
  // ---------------------------------------------------

  topicCommand =
    String("cycleguard/device/") +
    DEVICE_ID +
    "/command";

  topicStatus =
    String("cycleguard/device/") +
    DEVICE_ID +
    "/status";

  topicAlert =
    String("cycleguard/device/") +
    DEVICE_ID +
    "/alert";


  // ---------------------------------------------------
  // TLS
  // ---------------------------------------------------

  // Prototype only.
  // Replace with CA certificate validation for production.
  tlsClient.setInsecure();


  // ---------------------------------------------------
  // MQTT
  // ---------------------------------------------------

  mqttClient.setServer(
    MQTT_HOST,
    MQTT_PORT
  );

  mqttClient.setCallback(
    onMqttMessage
  );

  mqttClient.setBufferSize(512);


  // ---------------------------------------------------
  // Startup
  // ---------------------------------------------------

  Serial.println("[System] Starting in DISARMED state");

  currentState = STATE_OFF;
  alarmActive = false;

  connectWiFi();
  connectMQTT();
}


// =====================================================
// MAIN LOOP
// =====================================================

void loop() {

  // ---------------------------------------------------
  // Wi-Fi
  // ---------------------------------------------------

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }


  // ---------------------------------------------------
  // MQTT
  // ---------------------------------------------------

  if (!mqttClient.connected()) {
    connectMQTT();
  }
  else {
    mqttClient.loop();
  }


  // ---------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------

  if (
    mqttClient.connected() &&
    millis() - lastHeartbeat >= HEARTBEAT_INTERVAL
  ) {

    lastHeartbeat = millis();

    publishStatus(true);
  }


  // ---------------------------------------------------
  // Vibration Detection
  // ---------------------------------------------------

  if (currentState == STATE_ARMED) {

    processVibration();
  }


  // ---------------------------------------------------
  // Alarm Output
  // ---------------------------------------------------

  if (currentState == STATE_ALARM) {

    processAlarmOutputs();
  }


  // ---------------------------------------------------
  // Small loop delay
  // ---------------------------------------------------

  delay(5);
}


// =====================================================
// WIFI
// =====================================================

void connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.printf(
    "[WiFi] Connecting to %s",
    WIFI_SSID
  );

  WiFi.mode(WIFI_STA);

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  int attempts = 0;

  while (
    WiFi.status() != WL_CONNECTED &&
    attempts < 20
  ) {

    delay(500);

    Serial.print(".");

    attempts++;
  }


  if (WiFi.status() == WL_CONNECTED) {

    Serial.println();

    Serial.println("[WiFi] Connected!");

    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("[WiFi] RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

  }
  else {

    Serial.println();

    Serial.println(
      "[WiFi] Connection timeout"
    );
  }
}


// =====================================================
// MQTT
// =====================================================

void connectMQTT() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (mqttClient.connected()) {
    return;
  }


  Serial.print(
    "[MQTT] Connecting to EMQX..."
  );


  String clientId =
    String("cycleguard-esp32-") +
    DEVICE_ID;


  String lwtPayload =
    String("{\"deviceId\":\"") +
    DEVICE_ID +
    "\",\"status\":\"OFFLINE\"}";


  bool connected =
    mqttClient.connect(
      clientId.c_str(),
      MQTT_USERNAME,
      MQTT_PASSWORD,

      topicStatus.c_str(),
      1,
      true,

      lwtPayload.c_str()
    );


  if (connected) {

    Serial.println(" connected!");


    mqttClient.subscribe(
      topicCommand.c_str(),
      1
    );


    Serial.print(
      "[MQTT] Subscribed: "
    );

    Serial.println(
      topicCommand
    );


    publishStatus(true);

  }
  else {

    Serial.print(
      " failed, rc="
    );

    Serial.println(
      mqttClient.state()
    );
  }
}


// =====================================================
// MQTT MESSAGE
// =====================================================

void onMqttMessage(
  char* topic,
  byte* payload,
  unsigned int length
) {

  String message = "";


  for (
    unsigned int i = 0;
    i < length;
    i++
  ) {

    message +=
      (char)payload[i];
  }


  message.trim();


  Serial.println();
  Serial.println(
    "========== MQTT COMMAND =========="
  );

  Serial.print("Topic: ");
  Serial.println(topic);

  Serial.print("Message: ");
  Serial.println(message);


  String command = "";


  // ---------------------------------------------------
  // JSON command
  // {"command":"ARM"}
  // ---------------------------------------------------

  StaticJsonDocument<256> doc;

  DeserializationError error =
    deserializeJson(
      doc,
      message
    );


  if (
    !error &&
    doc.containsKey("command")
  ) {

    command =
      doc["command"].as<String>();
  }

  else {

    command = message;
  }


  command.toUpperCase();


  // ---------------------------------------------------
  // ARM
  // ---------------------------------------------------

  if (command == "ARM") {

    handleArm();
  }


  // ---------------------------------------------------
  // DISARM
  // ---------------------------------------------------

  else if (command == "DISARM") {

    handleDisarm();
  }


  else {

    Serial.print(
      "[MQTT] Unknown command: "
    );

    Serial.println(command);
  }


  Serial.println(
    "=================================="
  );
}


// =====================================================
// ARM
// =====================================================

void handleArm() {

  Serial.println();
  Serial.println(
    "[Security] ARMED"
  );


  currentState = STATE_ARMED;

  alarmActive = false;


  resetVibrationDetection();


  digitalWrite(
    PIN_BUZZER,
    LOW
  );


  digitalWrite(
    PIN_LED,
    HIGH
  );


  soundChirp(1);


  publishStatus(true);
}


// =====================================================
// DISARM
// =====================================================

void handleDisarm() {

  Serial.println();
  Serial.println(
    "[Security] DISARMED"
  );


  currentState = STATE_OFF;

  alarmActive = false;


  resetVibrationDetection();


  digitalWrite(
    PIN_BUZZER,
    LOW
  );


  digitalWrite(
    PIN_LED,
    LOW
  );


  soundChirp(2);


  publishStatus(true);
}


// =====================================================
// VIBRATION PROCESSING
// =====================================================

void processVibration() {

  int sensorState =
    digitalRead(PIN_SENSOR);


  // Your working SW-420 setup
  // detects vibration as HIGH.
  if (sensorState != HIGH) {
    return;
  }


  // ---------------------------------------------------
  // Debounce
  // ---------------------------------------------------

  unsigned long now =
    millis();


  if (
    now - lastVibrationEvent <
    VIBRATION_DEBOUNCE
  ) {

    return;
  }


  lastVibrationEvent = now;


  // ---------------------------------------------------
  // Start new detection window
  // ---------------------------------------------------

  if (
    vibrationCount == 0 ||
    now - vibrationWindowStart >
    VIBRATION_WINDOW
  ) {

    vibrationWindowStart = now;

    vibrationCount = 0;
  }


  vibrationCount++;


  Serial.print(
    "[Sensor] Vibration event: "
  );

  Serial.println(
    vibrationCount
  );


  // ---------------------------------------------------
  // Threshold reached
  // ---------------------------------------------------

  if (
    vibrationCount >=
    VIBRATION_THRESHOLD
  ) {

    triggerAlarm();
  }
}


// =====================================================
// RESET VIBRATION DETECTION
// =====================================================

void resetVibrationDetection() {

  vibrationCount = 0;

  vibrationWindowStart = 0;

  lastVibrationEvent = 0;
}


// =====================================================
// TRIGGER ALARM
// =====================================================

void triggerAlarm() {

  if (currentState == STATE_ALARM) {
    return;
  }


  currentState = STATE_ALARM;

  alarmActive = true;


  Serial.println();
  Serial.println(
    "!!! SUSPICIOUS MOVEMENT !!!"
  );

  Serial.println(
    "[Security] ALARM ACTIVE"
  );


  // Immediate buzzer
  digitalWrite(
    PIN_BUZZER,
    HIGH
  );


  // Immediate LED
  digitalWrite(
    PIN_LED,
    HIGH
  );


  // Reset output timer
  lastAlarmToggle = millis();

  alarmOutputState = true;


  // Publish ONE alert
  if (mqttClient.connected()) {

    publishAlert(
      "MOVEMENT_DETECTED"
    );

    publishStatus(true);
  }
}


// =====================================================
// ALARM OUTPUTS
// =====================================================

void processAlarmOutputs() {

  unsigned long now =
    millis();


  if (
    now - lastAlarmToggle >=
    ALARM_TOGGLE_INTERVAL
  ) {

    lastAlarmToggle = now;

    alarmOutputState =
      !alarmOutputState;


    digitalWrite(
      PIN_BUZZER,
      alarmOutputState
    );


    digitalWrite(
      PIN_LED,
      alarmOutputState
    );
  }
}


// =====================================================
// STATUS
// =====================================================

void publishStatus(bool retained) {

  if (!mqttClient.connected()) {
    return;
  }


  StaticJsonDocument<256> doc;


  doc["deviceId"] =
    DEVICE_ID;


  doc["status"] =
    "ONLINE";


  switch (currentState) {

    case STATE_ARMED:

      doc["securityState"] =
        "ON";

      break;


    case STATE_ALARM:

      doc["securityState"] =
        "ALARM";

      break;


    case STATE_OFF:

    default:

      doc["securityState"] =
        "OFF";

      break;
  }


  doc["alarmActive"] =
    alarmActive;


  char buffer[256];


  serializeJson(
    doc,
    buffer
  );


  mqttClient.publish(
    topicStatus.c_str(),
    buffer,
    retained
  );


  Serial.print(
    "[MQTT] Status: "
  );

  Serial.println(
    buffer
  );
}


// =====================================================
// ALERT
// =====================================================

void publishAlert(
  const char* eventType
) {

  if (!mqttClient.connected()) {
    return;
  }


  StaticJsonDocument<256> doc;


  doc["deviceId"] =
    DEVICE_ID;


  doc["event"] =
    eventType;


  doc["timestamp"] =
    millis();


  char buffer[256];


  serializeJson(
    doc,
    buffer
  );


  mqttClient.publish(
    topicAlert.c_str(),
    buffer,
    false
  );


  Serial.print(
    "[MQTT] Alert: "
  );

  Serial.println(
    buffer
  );
}


// =====================================================
// BUZZER CHIRP
// =====================================================

void soundChirp(
  int count
) {

  for (
    int i = 0;
    i < count;
    i++
  ) {

    digitalWrite(
      PIN_BUZZER,
      HIGH
    );

    delay(80);

    digitalWrite(
      PIN_BUZZER,
      LOW
    );


    if (
      i < count - 1
    ) {

      delay(80);
    }
  }
}
