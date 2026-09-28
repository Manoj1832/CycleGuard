// Copy to config.h (git-ignored) and fill in. NEVER commit real credentials.
#pragma once
#define WIFI_SSID      "your-wifi-name"
#define WIFI_PASSWORD  "your-wifi-password"
#define MQTT_HOST      "your-broker.emqxsl.com"
#define MQTT_PORT      8883
#define MQTT_USERNAME  "cycleguard-device"   // separate EMQX user from the backend, publish status/alert only
#define MQTT_PASSWORD  "change-me"
#define DEVICE_ID      "001"
