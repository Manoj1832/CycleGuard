# CycleGuard — REST API

## Base URL

- **Development:** `http://localhost:3000`
- **Production:** `https://your-backend.onrender.com`

## Endpoints

### Health Check

```
GET /api/health
```

**Response:**

```json
{
  "status": "ok",
  "service": "cycleguard-backend",
  "mqtt": true,
  "websocketClients": 2,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

---

### Device Status

```
GET /api/device/:deviceId/status
```

**Example:** `GET /api/device/001/status`

**Response:**

```json
{
  "success": true,
  "deviceId": "001",
  "securityState": "OFF",
  "connectionState": "CONNECTED",
  "alarmActive": false,
  "lastActivity": null,
  "lastSeen": "2024-01-15T10:30:00.000Z"
}
```

---

### Arm Device

```
POST /api/device/:deviceId/arm
```

**Body:**

```json
{
  "pin": "1234"
}
```

**Success Response:**

```json
{
  "success": true,
  "deviceId": "001",
  "state": "ON"
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": "Incorrect PIN."
}
```

---

### Disarm Device

```
POST /api/device/:deviceId/disarm
```

**Body:**

```json
{
  "pin": "1234"
}
```

**Success Response:**

```json
{
  "success": true,
  "deviceId": "001",
  "state": "OFF"
}
```

---

### Clear Alarm

```
POST /api/device/:deviceId/alarm/clear
```

**Body:**

```json
{
  "pin": "1234"
}
```

**Success Response:**

```json
{
  "success": true,
  "deviceId": "001",
  "state": "OFF"
}
```

## Error Responses

| Status | Meaning |
|---|---|
| 401 | Invalid PIN or rate limited |
| 404 | Endpoint not found |
| 500 | Internal server error |

## Rate Limiting

PIN verification is rate-limited per client IP:

- **Max attempts:** 5
- **Lockout duration:** 60 seconds
- **Reset:** Successful verification resets the counter

## WebSocket

### Connection

```
ws://localhost:3000/ws
wss://your-backend.onrender.com/ws
```

### Server → Client Messages

**Security State:**
```json
{
  "type": "security_state",
  "deviceId": "001",
  "state": "ON",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Movement Detected:**
```json
{
  "type": "movement_detected",
  "deviceId": "001",
  "timestamp": "2024-01-15T10:32:00.000Z"
}
```

**Alarm:**
```json
{
  "type": "alarm",
  "deviceId": "001",
  "active": true,
  "timestamp": "2024-01-15T10:32:01.000Z"
}
```

**Device Status:**
```json
{
  "type": "device_status",
  "deviceId": "001",
  "status": "ONLINE"
}
```
