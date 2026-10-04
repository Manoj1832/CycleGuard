import 'package:flutter/foundation.dart';
import '../models/device_state.dart';
import '../services/websocket_service.dart';
import '../services/api_service.dart';
import '../config.dart';

/// Device state provider — manages real-time device state via WebSocket
class DeviceProvider extends ChangeNotifier {
  final WebSocketService _wsService = WebSocketService();

  DeviceState _deviceState = const DeviceState(deviceId: AppConfig.deviceId);
  bool _wsConnected = false;
  String? _error;
  List<ActivityEvent> _activityLog = [];

  DeviceState get deviceState => _deviceState;
  bool get wsConnected => _wsConnected;
  String? get error => _error;
  List<ActivityEvent> get activityLog => List.unmodifiable(_activityLog);

  /// Initialize WebSocket connection
  void initialize() {
    _wsService.addHandler(_onWsMessage);
    _wsService.connect();
    _wsConnected = true;
    notifyListeners();
  }

  /// Handle incoming WebSocket messages
  void _onWsMessage(Map<String, dynamic> message) {
    final type = message['type'] as String?;

    switch (type) {
      case 'security_state':
        final state = message['state'] as String? ?? 'OFF';
        _deviceState = _deviceState.copyWith(
          securityState: state,
          pending: false,
        );
        _addActivity('Security state: $state');
        break;

      case 'alarm':
        final active = message['active'] == true;
        _deviceState = _deviceState.copyWith(
          alarmActive: active,
          securityState: active ? 'ALARM' : _deviceState.securityState,
        );
        if (active) {
          _addActivity('⚠️ ALARM TRIGGERED');
        }
        break;

      case 'movement_detected':
        _deviceState = _deviceState.copyWith(
          lastMovement: DateTime.now(),
        );
        _addActivity('🔴 Movement detected');
        break;

      case 'device_status':
        final status = message['status'] as String? ?? 'OFFLINE';
        _deviceState = _deviceState.copyWith(connectionState: status);
        _addActivity('Device: $status');
        break;
    }

    notifyListeners();
  }

  /// ARM the device
  Future<bool> armDevice(String authToken) async {
    try {
      _deviceState = _deviceState.copyWith(pending: true);
      _error = null;
      notifyListeners();

      final result = await ApiService.armDevice(authToken);

      if (result['success'] == true) {
        _addActivity('ARM command sent');
        return true;
      } else {
        _deviceState = _deviceState.copyWith(pending: false);
        _error = result['error'] as String? ?? 'Failed to arm device';
        notifyListeners();
        return false;
      }
    } catch (e) {
      _deviceState = _deviceState.copyWith(pending: false);
      _error = 'Connection error';
      notifyListeners();
      return false;
    }
  }

  /// DISARM the device
  Future<bool> disarmDevice(String authToken) async {
    try {
      _deviceState = _deviceState.copyWith(pending: true);
      _error = null;
      notifyListeners();

      final result = await ApiService.disarmDevice(authToken);

      if (result['success'] == true) {
        _addActivity('DISARM command sent');
        return true;
      } else {
        _deviceState = _deviceState.copyWith(pending: false);
        _error = result['error'] as String? ?? 'Failed to disarm device';
        notifyListeners();
        return false;
      }
    } catch (e) {
      _deviceState = _deviceState.copyWith(pending: false);
      _error = 'Connection error';
      notifyListeners();
      return false;
    }
  }

  /// Clear alarm
  Future<bool> clearAlarm(String authToken) async {
    try {
      final result = await ApiService.clearAlarm(authToken);
      if (result['success'] == true) {
        _addActivity('Alarm clear sent');
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  void _addActivity(String description) {
    _activityLog.insert(0, ActivityEvent(
      description: description,
      timestamp: DateTime.now(),
    ));
    // Keep only last 20 events
    if (_activityLog.length > 20) {
      _activityLog = _activityLog.sublist(0, 20);
    }
  }

  /// Cleanup
  @override
  void dispose() {
    _wsService.removeHandler(_onWsMessage);
    _wsService.disconnect();
    super.dispose();
  }
}

/// Simple activity event for the log
class ActivityEvent {
  final String description;
  final DateTime timestamp;

  ActivityEvent({required this.description, required this.timestamp});
}
