# CycleGuard — MQTT Topics

## Broker

| Setting | Value |
|---|---|
| Host | `j22792b7.ala.eu-central-1.emqxsl.com` |
| MQTT/TLS Port | `8883` |
| WebSocket/TLS Port | `8084` |
| Username | `cycleguard` |
| Protocol | MQTT over TLS |

## Topic Structure

All topics follow the pattern:

```
cycleguard/device/{deviceId}/{channel}
```

## Topics

### Command (Backend → ESP32)

**Topic:** `cycleguard/device/001/command`

**Direction:** Backend publishes, ESP32 subscribes

**Payloads:**

ARM:
```json
{
  "command": "ARM",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

DISARM:
```json
{
  "command": "DISARM",
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

---

### Status (ESP32 → Backend)

**Topic:** `cycleguard/device/001/status`

**Direction:** ESP32 publishes, Backend subscribes

**Payloads:**

Security state change:
```json
{
  "deviceId": "001",
  "securityState": "ON"
}
```

```json
{
  "deviceId": "001",
  "securityState": "OFF"
}
```

Device online/offline:
```json
{
  "deviceId": "001",
  "status": "ONLINE"
}
```

```json
{
  "deviceId": "001",
  "status": "OFFLINE"
}
```

---

### Alert (ESP32 → Backend)

**Topic:** `cycleguard/device/001/alert`

**Direction:** ESP32 publishes, Backend subscribes

**Payloads:**

Movement detected:
```json
{
  "deviceId": "001",
  "event": "MOVEMENT_DETECTED",
  "timestamp": "2024-01-15T10:32:00.000Z"
}
```

Alarm activated:
```json
{
  "deviceId": "001",
  "event": "ALARM_ACTIVE",
  "timestamp": "2024-01-15T10:32:01.000Z"
}
```

---

### Test (Bidirectional)

**Topic:** `cycleguard/device/001/test`

**Direction:** Either direction (for development and testing)

**Payload:**

```json
{
  "deviceId": "001",
  "message": "test",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

## QoS

| Topic | QoS |
|---|---|
| command | 1 |
| status | 1 |
| alert | 1 |
| test | 0 |

## Testing with MQTTX

1. Connect to `j22792b7.ala.eu-central-1.emqxsl.com:8883` (TLS)
2. Use username `cycleguard` and your password
3. Subscribe to `cycleguard/device/001/#` to see all traffic
4. Publish test payloads to `cycleguard/device/001/test`
5. Publish ARM/DISARM commands to `cycleguard/device/001/command`
6. Publish simulated alerts to `cycleguard/device/001/alert`
