# CycleGuard — ESP32-C3 Firmware

## Status

⚠️ **Not yet implemented.** This directory is reserved for the ESP32-C3 SuperMini firmware.

## Hardware

| Component | Purpose |
|---|---|
| ESP32-C3 SuperMini | Main MCU |
| SW-420 Vibration Sensor | Movement detection |
| Active Buzzer | Local alarm |
| Status LED | Visual indicator |
| Push Button | Manual control |

## Architecture

```
SW-420 Sensor → ESP32 GPIO (interrupt)
                    ↓
              Buzzer ON (immediate, no cloud dependency)
                    ↓
              MQTT Publish → EMQX → Backend → UI
```

## MQTT Contract

### Subscribe

```
cycleguard/device/001/command
```

Expected payloads:

```json
{ "command": "ARM", "timestamp": "..." }
{ "command": "DISARM", "timestamp": "..." }
```

### Publish

**Status** → `cycleguard/device/001/status`

```json
{ "deviceId": "001", "securityState": "ON" }
{ "deviceId": "001", "status": "ONLINE" }
```

**Alert** → `cycleguard/device/001/alert`

```json
{ "deviceId": "001", "event": "MOVEMENT_DETECTED", "timestamp": "..." }
{ "deviceId": "001", "event": "ALARM_ACTIVE", "timestamp": "..." }
```

## Critical Principle

**The local alarm (buzzer) must operate independently of cloud connectivity.**

If Wi-Fi or MQTT is down, the buzzer must still sound when movement is detected while armed.

## GPIO Notes

> ⚠️ Do **not** assume GPIO pin numbers until verified on the physical ESP32-C3 SuperMini board. Different variants may have different pin mappings.

Typical ESP32-C3 SuperMini available GPIOs:
- GPIO 0–10 (some with restrictions)
- GPIO 20, 21 (serial)

Verify with your specific board's pinout diagram.

## Development

1. Install Arduino IDE or PlatformIO
2. Add ESP32-C3 board support
3. Configure Wi-Fi credentials
4. Configure MQTT credentials
5. Wire components
6. Flash firmware
7. Test with MQTTX before connecting to backend

## Next Steps

1. Wire hardware on breadboard
2. Verify pin mapping
3. Implement basic Wi-Fi + MQTT connection
4. Implement vibration detection
5. Implement buzzer control
6. Test full ARM → vibration → alarm → DISARM cycle
