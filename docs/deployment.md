# CycleGuard — Deployment Guide

## Architecture

```
Mobile Browser
      ↓ HTTPS
Vercel (Frontend)
      ↓ WSS / HTTPS
Render (Backend Node.js)
      ↓ MQTT/TLS
EMQX Cloud
      ↓ MQTT/TLS
ESP32-C3 (Physical Device)
```

---

## 1. Frontend — Vercel

### Prerequisites

- GitHub repository with the project
- Vercel account ([vercel.com](https://vercel.com))

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/cycleguard.git
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - **Root Directory:** `frontend`
   - **Framework Preset:** Other
   - **Build Command:** (leave empty — static files)
   - **Output Directory:** `.` (current directory)

3. **Deploy**
   - Click Deploy
   - Vercel will serve the static frontend files

4. **Update Frontend Config**
   - After backend is deployed, update `frontend/js/config.js`:
     ```js
     API_BASE_URL: 'https://your-backend.onrender.com',
     WS_URL: 'wss://your-backend.onrender.com/ws',
     MOCK_MODE: false,
     ```

5. **Custom Domain (Optional)**
   - In Vercel project settings → Domains
   - Add your custom domain

---

## 2. Backend — Render

### Prerequisites

- GitHub repository
- Render account ([render.com](https://render.com))

### Steps

1. **Create Web Service**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - New → Web Service
   - Connect your GitHub repository

2. **Configure**
   | Setting | Value |
   |---|---|
   | Name | `cycleguard-backend` |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |

3. **Environment Variables**
   Add these in Render dashboard:

   | Variable | Value |
   |---|---|
   | `PORT` | `3000` |
   | `MQTT_HOST` | `j22792b7.ala.eu-central-1.emqxsl.com` |
   | `MQTT_PORT` | `8883` |
   | `MQTT_USERNAME` | `cycleguard` |
   | `MQTT_PASSWORD` | (your EMQX password) |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGINS` | `https://your-frontend.vercel.app` |
   | `DEFAULT_PIN` | `1234` |

4. **Deploy**
   - Render will build and deploy automatically
   - Note the deployed URL (e.g., `https://cycleguard-backend.onrender.com`)

5. **Verify**
   ```bash
   curl https://cycleguard-backend.onrender.com/api/health
   ```

---

## 3. MQTT Broker — EMQX Cloud

### Existing Deployment

| Setting | Value |
|---|---|
| Host | `j22792b7.ala.eu-central-1.emqxsl.com` |
| MQTT/TLS Port | `8883` |
| WebSocket/TLS Port | `8084` |
| Username | `cycleguard` |

### Configuration

1. **Authentication**
   - Ensure `cycleguard` user exists with a secure password
   - Backend and ESP32 use this same credential

2. **ACL (Optional)**
   - Restrict `cycleguard` user to `cycleguard/#` topics

3. **Testing**
   - Use MQTTX client to verify connectivity
   - Subscribe to `cycleguard/device/001/#`
   - Publish test messages

---

## 4. Post-Deployment Checklist

- [ ] Frontend loads on Vercel
- [ ] Backend health check returns `{ "status": "ok" }`
- [ ] Backend connects to EMQX (check health endpoint `mqtt: true`)
- [ ] Frontend connects to backend WebSocket
- [ ] ARM/DISARM flow works end-to-end
- [ ] CORS allows only the production frontend origin
- [ ] No secrets exposed in frontend code
- [ ] HTTPS enforced on all connections

---

## 5. Render Free Tier Notes

Render free tier services spin down after inactivity. The first request after spin-down will take ~30 seconds. For production use, consider a paid plan.

The MQTT connection will also disconnect during spin-down. The backend reconnects automatically on startup.
