/// Device state model matching backend WebSocket payloads
class DeviceState {
  final String deviceId;
  final String securityState; // 'OFF', 'ON', 'ALARM'
  final bool alarmActive;
  final String connectionState; // 'ONLINE', 'OFFLINE'
  final bool pending;
  final DateTime? lastMovement;

  const DeviceState({
    required this.deviceId,
    this.securityState = 'OFF',
    this.alarmActive = false,
    this.connectionState = 'OFFLINE',
    this.pending = false,
    this.lastMovement,
  });

  bool get isArmed => securityState == 'ON';
  bool get isAlarm => securityState == 'ALARM' || alarmActive;
  bool get isOnline => connectionState == 'ONLINE';

  DeviceState copyWith({
    String? deviceId,
    String? securityState,
    bool? alarmActive,
    String? connectionState,
    bool? pending,
    DateTime? lastMovement,
  }) {
    return DeviceState(
      deviceId: deviceId ?? this.deviceId,
      securityState: securityState ?? this.securityState,
      alarmActive: alarmActive ?? this.alarmActive,
      connectionState: connectionState ?? this.connectionState,
      pending: pending ?? this.pending,
      lastMovement: lastMovement ?? this.lastMovement,
    );
  }
}
