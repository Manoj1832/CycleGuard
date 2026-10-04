import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

/// REST API service for backend communication
class ApiService {
  static final _client = http.Client();

  /// Verify PIN and get auth token
  static Future<Map<String, dynamic>> verifyPin(String pin, String action) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/auth/pin/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'pin': pin, 'action': action}),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Get auth status (lockout info, passkey availability)
  static Future<Map<String, dynamic>> getAuthStatus() async {
    final response = await _client.get(
      Uri.parse('${AppConfig.apiBaseUrl}/api/auth/status'),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// ARM device
  static Future<Map<String, dynamic>> armDevice(String authToken) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/device/${AppConfig.deviceId}/arm'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'authToken': authToken}),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// DISARM device
  static Future<Map<String, dynamic>> disarmDevice(String authToken) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/device/${AppConfig.deviceId}/disarm'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'authToken': authToken}),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Clear alarm
  static Future<Map<String, dynamic>> clearAlarm(String authToken) async {
    final response = await _client.post(
      Uri.parse('${AppConfig.apiBaseUrl}/api/device/${AppConfig.deviceId}/alarm/clear'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'authToken': authToken}),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Get device state
  static Future<Map<String, dynamic>> getDeviceState() async {
    final response = await _client.get(
      Uri.parse('${AppConfig.apiBaseUrl}/api/device/${AppConfig.deviceId}/state'),
    ).timeout(AppConfig.httpTimeout);

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  /// Health check
  static Future<bool> healthCheck() async {
    try {
      final response = await _client.get(
        Uri.parse('${AppConfig.apiBaseUrl}/api/health'),
      ).timeout(const Duration(seconds: 5));

      final data = jsonDecode(response.body);
      return data['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }

  /// Register FCM device token for push notifications
  static Future<bool> registerFcmToken(String fcmToken) async {
    try {
      final response = await _client.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/device/${AppConfig.deviceId}/fcm/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'fcmToken': fcmToken}),
      ).timeout(AppConfig.httpTimeout);

      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
