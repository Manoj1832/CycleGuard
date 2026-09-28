# CycleGuard — Architecture

## System Overview

```
┌─────────────┐     HTTPS / WSS     ┌──────────────┐     MQTT/TLS     ┌─────────────┐     MQTT/TLS     ┌──────────────┐
│             │  ←──────────────→   │              │  ←────────────→  │             │  ←────────────→  │              │
│   Browser   │                     │   Node.js    │                  │    EMQX     │                  │   ESP32-C3   │
│  (Frontend) │                     │  (Backend)   │                  │   Cloud     │                  │  (Firmware)  │
│             │                     │              │                  │             │                  │              │
└─────────────┘                     └──────────────┘                  └─────────────┘                  └──────────────┘
   Vercel                              Render                          EMQX Cloud                       Physical Device
```

## Data Flow

### ARM (Turn Security ON)

```
User → PIN Entry → Frontend → HTTPS POST /api/device/001/arm
                                    ↓
                              Backend verifies PIN
                                    ↓
                              MQTT Publish → cycleguard/device/001/command → { "command": "ARM" }
                                    ↓
                              EMQX → ESP32 subscribes, receives ARM
                                    ↓
                              ESP32 enters armed mode, monitors vibration
                                    ↓
                              ESP32 publishes status → cycleguard/device/001/status → { "securityState": "ON" }
                                    ↓
                              Backend receives via MQTT → updates state → broadcasts via WebSocket
                                    ↓
                              Frontend receives WebSocket message → UI updates to ON
```

### Movement Detection (Alarm)

```
Vibration → SW-420 sensor → ESP32 GPIO interrupt
                                ↓
                          Buzzer ON (immediate, local)
                                ↓
                          ESP32 publishes → cycleguard/device/001/alert → { "event": "ALARM_ACTIVE" }
                                ↓
                          EMQX → Backend MQTT subscription
                                ↓
                          Backend updates state → broadcasts via WebSocket
                                ↓
                          Frontend receives → UI enters ALARM state
```

### DISARM (Turn Security OFF)

```
User → PIN Entry → Frontend → HTTPS POST /api/device/001/disarm
                                    ↓
                              Backend verifies PIN
                                    ↓
                              MQTT Publish → cycleguard/device/001/command → { "command": "DISARM" }
                                    ↓
                              ESP32 receives → stops buzzer → exits armed mode
                                    ↓
                              ESP32 publishes status → { "securityState": "OFF" }
                                    ↓
                              Backend → WebSocket → Frontend → UI updates to OFF
```

## Component Responsibilities

### Frontend (Browser)
- Mobile-first single-page application
- State management (centralized observable state)
- PIN entry and local validation
- WebSocket connection to backend
- REST API calls for security actions
- Responsive UI rendering

### Backend (Node.js)
- Express REST API
- WebSocket server for real-time updates
- MQTT client (connects to EMQX)
- PIN verification with rate limiting
- Device state management (in-memory)
- Bridges MQTT events to WebSocket clients
- Keeps all secrets server-side

### EMQX Cloud (MQTT Broker)
- Manages MQTT connections from backend and ESP32
- Routes messages between subscribers and publishers
- TLS encryption for all connections
- Authentication via username/password

### ESP32-C3 (Firmware)
- Connects to Wi-Fi and MQTT
- Monitors SW-420 vibration sensor
- Controls buzzer (local alarm)
- Controls status LED
- Handles button input
- Publishes device status and alerts
- Subscribes to commands
- **Operates local alarm independently of cloud**

## Security Architecture

```
Browser ← HTTPS/WSS → Backend ← MQTT/TLS → EMQX ← MQTT/TLS → ESP32
  ↑                      ↑                    ↑                   ↑
  │                      │                    │                   │
  No MQTT creds      Holds all secrets    Auth required       Auth required
  No direct MQTT     PIN verification     TLS only            TLS only
  HTTPS only         Rate limiting
```

## Deployment Architecture

| Component | Platform | Protocol |
|---|---|---|
| Frontend | Vercel | HTTPS |
| Backend | Render | HTTPS + WSS |
| MQTT Broker | EMQX Cloud | MQTT/TLS (8883) |
| ESP32 | Physical device | MQTT/TLS (8883) |
