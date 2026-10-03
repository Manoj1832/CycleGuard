# CycleGuard — ESP32-C3 Production Firmware

## Overview

Firmware for the physical **ESP32-C3 SuperMini** bicycle security awareness node.
It operates the local vibration detection, piezo buzzer alarm, status indicator LED, and communicates via MQTT over TLS (Port 8883) with EMQX Cloud.

> **Physical Security Principle**: The physical bicycle lock remains the primary theft barrier. CycleGuard adds an active electronic awareness layer that detects tampering, sounds a local siren, and pushes instant alerts to the owner's web application.

---

## Hardware Pinout & Wiring

| Component | ESP32-C3 Pin | Wiring Details |
|---|---|---|
| **SW-420 Vibration Sensor** | `GPIO 4` | `DO` -> `GPIO 4`, `VCC` -> `3.3V`, `GND` -> `GND` |
| **Active Buzzer** | `GPIO 5` | `Positive (+)` -> `GPIO 5`, `Negative (-)` -> `GND` |
| **Status LED** | `GPIO 2` | `Anode (+)` -> `220Ω Resistor` -> `GPIO 2`, `Cathode (-)` -> `GND` |

> ⚠️ **IMPORTANT**: There is **NO physical push button**. ARM and DISARM commands are executed exclusively through the authenticated mobile web app.

---

## State Machine & Behavior

```
       ┌───────────┐
       │ DISARMED  │ ◄─────── DISARM command (from web app)
       └─────┬─────┘
             │ ARM command (from web app)
             ▼
       ┌───────────┐
       │   ARMED   │ ───────► DISARM command (from web app)
       └─────┬─────┘
             │ Confirmed suspicious movement (3 vibrations within 3s)
             ▼
       ┌───────────┐
       │   ALARM   │ ───────► DISARM command (from web app)
       └───────────┘
```

| State | Buzzer | LED | SW-420 Monitoring | MQTT Status Published |
|---|---|---|---|---|
| **DISARMED** | OFF | OFF | Disabled | `DISARMED` (retained) |
| **ARMED** | OFF | Solid ON | Active (3 pulses / 3s threshold) | `ARMED` |
| **ALARM** | Continuous ON | Blinking (150 ms) | Active | `ALARM` + Alert: `VIBRATION_DETECTED` |

---

## Vibration Confirmation Algorithm

To eliminate false triggers from incidental bumps (wind, passing vehicles):
- **Confirmation Window**: `3000 ms` (3 seconds)
- **Vibration Threshold**: `3 distinct pulses`
- **Debounce Interval**: `100 ms`

1. When `ARMED`, the ESP32 reads the SW-420 digital output.
2. A single vibration pulse registers as Event 1 and starts a 3-second timer.
3. If 3 or more distinct pulses occur within 3 seconds, the device immediately transitions to **ALARM**.
4. If 3 seconds elapse without reaching 3 pulses, the counter resets to 0.
5. All timing is `millis()`-based (non-blocking).

---

## Local Alarm Independence

**The local alarm functions completely independently of cloud connectivity.**
If the bicycle is armed and WiFi/cellular hotspot is unavailable:
- SW-420 movement detection continues running locally.
- When 3 vibrations occur, the **buzzer activates immediately** and the LED blinks.
- When network connectivity returns, the pending `VIBRATION_DETECTED` alert and `ALARM` status are published to EMQX.

---

## MQTT Contract

| Channel | Topic | Payload | Direction | Description |
|---|---|---|---|---|
| **Command** | `cycleguard/device/001/command` | `ARM` / `DISARM` | Web App → ESP32 | Authorized user command |
| **Status** | `cycleguard/device/001/status` | `DISARMED` / `ARMED` / `ALARM` | ESP32 → Backend | Retained device state |
| **Alert** | `cycleguard/device/001/alert` | `VIBRATION_DETECTED` | ESP32 → Backend | Triggered on tamper |

---

## Configuration & Credentials

Credentials are kept in `firmware/config.h` which is excluded from Git:

1. Copy `firmware/config.example.h` to `firmware/config.h`:
   ```bash
   cp firmware/config.example.h firmware/config.h
   ```
2. Fill in your WiFi network and EMQX broker credentials:
   ```c
   #pragma once
   #define WIFI_SSID      "Your_WiFi_Or_Hotspot"
   #define WIFI_PASSWORD  "Your_Password"
   #define MQTT_HOST      "j22792b7.ala.eu-central-1.emqxsl.com"
   #define MQTT_PORT      8883
   #define MQTT_USERNAME  "cycleguard"
   #define MQTT_PASSWORD  "Your_MQTT_Password"
   #define DEVICE_ID      "001"
   ```

---

## Flashing the ESP32-C3

### Method A: Arduino IDE
1. Install **ESP32 by Espressif Systems** via Boards Manager (`Tools > Board > Boards Manager`).
2. Select Board: **ESP32C3 Dev Module** (or **Generic ESP32-C3**).
3. Set **USB CDC On Boot**: **Enabled** (required for ESP32-C3 SuperMini USB Serial).
4. Install library **PubSubClient** by Nick O'Leary via Library Manager.
5. Open `firmware/main.cpp`.
6. Connect ESP32-C3 via USB and click **Upload**.
7. Open Serial Monitor at **115200 baud**.

### Method B: PlatformIO (VS Code / CLI)
```bash
cd firmware
pio run -t upload
pio device monitor -b 115200
```

---

## Step-by-Step Test Procedure

1. **TEST 1 (Boot)**: Power on ESP32. Serial logs show WiFi/MQTT connected. Buzzer OFF, LED OFF. Status: `DISARMED`.
2. **TEST 2 (ARM via Web)**: On web app, tap **ARM** and authenticate. ESP32 receives `ARM`. State changes to `ARMED`, LED turns solid ON, buzzer remains OFF.
3. **TEST 3 (Single bump)**: Tap the bike frame once. Serial shows `VIBRATION EVENT: 1`. Window expires after 3s; buzzer remains OFF (no false alarm).
4. **TEST 4 (Tamper / Alarm)**: Shake or tap the bike frame 3 times rapidly within 3 seconds. State transitions to `ALARM`. Buzzer sounds continuously, LED blinks rapidly. Web app displays Alarm Alert banner!
5. **TEST 5 (DISARM via Web)**: On web app, tap **DISARM** and authenticate. ESP32 receives `DISARM`. Buzzer immediately stops, LED turns OFF, counters reset. Status: `DISARMED`.
6. **TEST 6 (Offline Tamper)**: Turn phone hotspot OFF while armed. Shake bicycle. Local buzzer immediately activates and sounds continuously.
7. **TEST 7 (Reconnect)**: Turn hotspot back ON. ESP32 reconnects and publishes `VIBRATION_DETECTED` alert and `ALARM` status.
