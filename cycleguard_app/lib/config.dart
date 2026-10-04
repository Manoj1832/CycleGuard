/// CycleGuard App Configuration
class AppConfig {
  static const String apiBaseUrl = 'https://cycleguard-3jlr.onrender.com';
  static const String wsUrl = 'wss://cycleguard-3jlr.onrender.com/ws';
  static const String deviceId = '001';

  // Timeouts
  static const Duration httpTimeout = Duration(seconds: 15);
  static const Duration wsReconnectDelay = Duration(seconds: 3);
  static const int wsMaxReconnectAttempts = 10;
}
