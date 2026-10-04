# 🚲 CycleGuard Mobile App (Flutter)

A cross-platform native **Android & iOS** app for the CycleGuard bicycle security system with **biometric authentication** (Fingerprint / Face ID), **real-time WebSocket state synchronization**, **local alarm animations**, and **push notification readiness**.

---

## 📱 Features

- **Biometric Security**:
  - Android: Fingerprint & Biometric prompt (`local_auth` + `FlutterFragmentActivity`)
  - iOS: Face ID / Touch ID (`NSFaceIDUsageDescription` configured)
  - Numeric PIN fallback with animated keypad and brute-force lockout handling
- **Real-Time Synchronized Dashboard**:
  - Live device state (`ONLINE` / `OFFLINE`, `ARMED` / `DISARMED` / `ALARM`) via WebSocket
  - Animated pulsing security toggle button
  - Flashing alarm banner with haptic feedback
  - Real-time activity log showing security events
- **Backend Integration**:
  - REST API calls to CycleGuard on Render (`https://cycleguard-3jlr.onrender.com`)
  - WebSocket link (`wss://cycleguard-3jlr.onrender.com/ws`)
- **Design System**:
  - Dark cyberpunk aesthetic matching the CycleGuard web dashboard
  - Custom Inter typography via `google_fonts`
  - Smooth micro-animations and glowing indicators

---

## 🏗 Project Architecture

```
cycleguard_app/
├── android/                         # Native Android configuration
│   └── app/src/main/
│       ├── AndroidManifest.xml      # USE_BIOMETRIC, INTERNET, VIBRATE permissions
│       └── kotlin/.../MainActivity.kt # FlutterFragmentActivity for biometrics
├── ios/                             # Native iOS configuration
│   └── Runner/Info.plist            # NSFaceIDUsageDescription for Face ID
├── lib/
│   ├── config.dart                  # API & WebSocket endpoints, Device ID
│   ├── main.dart                    # App entry point, MultiProvider setup
│   ├── models/
│   │   ├── alert.dart               # MovementAlert model
│   │   └── device_state.dart        # DeviceState model
│   ├── providers/
│   │   ├── auth_provider.dart       # PIN verification & biometric state
│   │   └── device_provider.dart     # Real-time state & command dispatch
│   ├── screens/
│   │   ├── auth_screen.dart         # PIN pad & biometric prompt
│   │   ├── dashboard_screen.dart    # Main ARM/DISARM control & status
│   │   └── splash_screen.dart       # Health check & branding
│   ├── services/
│   │   ├── api_service.dart         # HTTP REST client (PIN, ARM, DISARM)
│   │   ├── biometric_service.dart   # Biometric authentication wrapper
│   │   └── websocket_service.dart   # WebSocket client with auto-reconnect
│   └── theme/
│       └── app_theme.dart           # Dark theme, colors, button styles
└── test/
    └── widget_test.dart             # Unit & model verification tests
```

---

## 🚀 Running the App

### Prerequisites
1. [Flutter SDK](https://flutter.dev/docs/get-started/install) installed (`flutter doctor` should be clear).
2. Android Studio with an Android Emulator OR a physical Android device with USB debugging enabled.
3. (For iOS) macOS with Xcode and CocoaPods.

### 1. Test & Analyze
Verify that the project compiles cleanly and passes all tests:
```bash
cd cycleguard_app
flutter analyze
flutter test
```

### 2. Run on Android Device / Emulator
Connect your phone via USB or start an Android emulator, then run:
```bash
flutter run
```

To build a release APK:
```bash
flutter build apk --release
```
The APK will be generated at `build/app/outputs/flutter-apk/app-release.apk`.

### 3. Run on iOS (macOS required)
```bash
cd ios && pod install && cd ..
flutter run
```

---

## 🔔 Enabling Firebase Cloud Messaging (FCM) Push Notifications

To receive push notifications even when the app is completely closed:

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project named `CycleGuard`.
2. **Add Android App**:
   - Package name: `com.cycleguard.cycleguard_app`
   - Download `google-services.json` and place it in `cycleguard_app/android/app/`.
3. **Add iOS App**:
   - Bundle identifier: `com.cycleguard.cycleguardApp`
   - Download `GoogleService-Info.plist` and place it in `cycleguard_app/ios/Runner/`.
4. **Backend Setup**:
   - Add the `FIREBASE_SERVICE_ACCOUNT` private key to Render environment variables.
   - When an MQTT alert (`MOVEMENT_DETECTED`) is received by the backend, it will trigger an FCM notification to all registered tokens.
