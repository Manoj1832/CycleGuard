# CycleGuard

**Smart Bicycle Security & Movement Detection System**

CycleGuard adds an electronic security and awareness layer to a normal bicycle lock. It provides real-time movement alerts, local alarm through ESP32 buzzer, and secure remote control through a mobile-first web application protected by **Biometric (WebAuthn/Passkey) Authentication** with **4-digit PIN fallback**.

---

## Features

- **Biometric Authentication (Primary)** — Fast, secure passkey / fingerprint / face recognition via WebAuthn
- **4-Digit PIN Fallback (Secondary)** — Server-verified numeric keypad with backend-enforced lockout
- **Backend Lockout** — 5 consecutive failed attempts trigger 30-second server-side lockout with live countdown
- **Security ON/OFF** — Arm and disarm your bicycle remotely with cryptographic authorization
- **Vibration/Movement Detection** — SW-420 sensor on ESP32
- **Local Alarm** — Buzzer sounds immediately; local security never depends on cloud connectivity
- **Real-Time Alerts** — Instant movement notifications via WebSocket
- **Device Status** — Live connection monitoring and command confirmation
- **Mobile-First UI** — Clean, animated bottom-sheet authentication optimized for 320px–430px viewports

---

## Architecture

```
Mobile Browser (Passkey/Biometric)
       ↓ HTTPS/WSS
Node.js + Express Backend (WebAuthn Server + PIN Lockout)
       ↓ MQTT/TLS
  EMQX Cloud
       ↓ MQTT/TLS
ESP32-C3 SuperMini (Buzzer + SW-420 Sensor)
```

The browser **never** connects directly to MQTT and **never** stores or transmits raw biometric data. All IoT communication flows through the backend authorization layer, which verifies the WebAuthn assertion or PIN before publishing commands.

---

## Authentication State Machine & Flow

```
                      OFF (Device State)
                               │
                       User taps "Turn ON"
                               │
                               ▼
                    AUTHENTICATION SHEET
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
        Biometric             PIN            Biometric
         Success            Success         Unavailable
            │                  │                  │
            │                  │                  ▼
            │                  │             PIN Fallback
            │                  │                  │
            └─────────┬────────┴──────────────────┘
                      │
                      ▼
            Single-Use AuthToken
                      │
                      ▼
               Backend Authorizes
                      │
                      ▼
           MQTT Command: "ARM" ──────────► ESP32 receives "ARM"
                      │                          │
                      ▼                          ▼
            "Activating security..."      Status: "ON"
                      │                          │
                      └──────────────┬───────────┘
                                     ▼
                               ON (Armed)
                                     │
                             Movement Detected
                                     │
                                     ▼
                          ALARM (Buzzer sounds)
                                     │
                            User taps "Turn OFF"
                                     │
                                     ▼
                           AUTHENTICATION SHEET
                                     │
                        ┌────────────┴────────────┐
                        │                         │
                     SUCCESS                   FAILURE
                        │                         │
                        ▼                         ▼
               MQTT: "DISARM"                ALARM remains
                        │                    Buzzer stays ON
                        ▼
                Status: "OFF"
```

### UX Rules:
- **ARM / DISARM / ALARM CLEAR**: Always require authentication first.
- **Biometric Failure**: Prompts clean retry or one-tap switch to PIN fallback.
- **PIN Failure**: Displays remaining attempts (5 max); triggers a 30s server-enforced lockout after 5 consecutive failures.
- **Lockout Rule**: Lockout is strictly enforced by the backend; refreshing the page does not bypass it. Lockout never disarms the bicycle automatically.
- **Alarm Disarming**: Incorrect PIN or failed biometric during active alarm keeps the buzzer and alarm sounding.

---

## MQTT Command Contract (Preserved)

CycleGuard strictly preserves the lightweight ESP32 command contract:

| Topic | Payload | Direction | Description |
|---|---|---|---|
| `cycleguard/device/001/command` | `ARM` | Backend → ESP32 | Turn security ON |
| `cycleguard/device/001/command` | `DISARM` | Backend → ESP32 | Turn security OFF / Clear Alarm |
| `cycleguard/device/001/status` | `{"securityState":"ON","alarmActive":false}` | ESP32 → Backend | Device heartbeat / confirmation |
| `cycleguard/device/001/alert` | `{"event":"MOVEMENT","timestamp":"..."}` | ESP32 → Backend | Vibration trigger notification |

The ESP32 **never** receives passwords, tokens, biometrics, or PINs.

---

## WebAuthn & Passkey Setup

1. **Production Requirements**:
   - WebAuthn requires a secure origin: `https://` or `localhost`.
   - Set `RP_ID` to your domain (e.g. `cycleguard.onrender.com` or `localhost`).
   - Set `EXPECTED_ORIGINS` to allowed web origins.
2. **Registration**:
   - Tap the gear icon in the header (or register button) to prompt `navigator.credentials.create()`.
   - Generates a public/private keypair inside the device's secure enclave (Touch ID, Face ID, Windows Hello).
   - Only the public key and credential ID are sent to the backend.
3. **Mock Mode (`AUTH_MOCK_MODE=true`)**:
   - For environments without hardware biometric authenticators or automated testing, mock authentication allows simulating success, failure, and unavailable states via developer panel (`Ctrl+Shift+D`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES6+), WebAuthn API |
| Backend | Node.js, Express, `@simplewebauthn/server` |
| Real-time | WebSocket (`ws`) |
| IoT | MQTT over TLS |
| Broker | EMQX Cloud |
| Hardware | ESP32-C3 SuperMini, SW-420, Buzzer |
| Deployment | Frontend on Vercel, Backend on Render |

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=3000
NODE_ENV=development

# MQTT Broker (EMQX Cloud)
MQTT_HOST=j22792b7.ala.eu-central-1.emqxsl.com
MQTT_PORT=8883
MQTT_USERNAME=cycleguard
MQTT_PASSWORD=your_mqtt_password

# CORS Origins
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080

# Fallback PIN
DEFAULT_PIN=2873

# WebAuthn & Lockout
RP_NAME=CycleGuard
RP_ID=localhost
EXPECTED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080,http://localhost:3000
AUTH_MOCK_MODE=true
LOCKOUT_SECONDS=30
```

---

## Local Development & Testing

### 1. Start Backend

```bash
cd backend
npm install
npm run dev
```

The backend server runs on `http://localhost:3000`.

### 2. Start Frontend

```bash
# Serve with any static web server (e.g., Python or serve)
cd frontend
python3 -m http.server 5500
```

Open `http://localhost:5500` in your mobile or desktop browser.

### 3. Keyboard Shortcuts & Testing Tools

- **`Ctrl + Shift + D`** (or `Cmd + Shift + D` on Mac): Opens the developer panel.
  - Test simulated device states: Connected, Disconnected, Security ON, Security OFF, Movement, Alarm.
  - Test authentication states: Bio Success, Bio Failure, Bio Unavailable, Trigger Lockout, Register Passkey.

---

## Security Considerations

1. **No Biometric Data Stored**: CycleGuard never sees or touches raw fingerprint or face data; it receives only signed WebAuthn assertions verified by the server.
2. **Single-Use Authorization Tokens**: Successfully authenticated requests generate cryptographically random, 60-second tokens that are consumed immediately upon command dispatch.
3. **Backend Rate-Limiting**: PIN authentication is rate-limited on the server. After 5 incorrect attempts, further attempts are blocked for 30 seconds across sessions.
4. **Credential Isolation**: MQTT broker credentials and secrets remain strictly in server environment variables.
