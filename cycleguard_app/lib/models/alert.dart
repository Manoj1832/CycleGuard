/// Alert model for movement and security events
class MovementAlert {
  final String deviceId;
  final DateTime timestamp;
  final String type;
  final String description;

  const MovementAlert({
    required this.deviceId,
    required this.timestamp,
    required this.type,
    required this.description,
  });

  factory MovementAlert.fromJson(Map<String, dynamic> json) {
    return MovementAlert(
      deviceId: json['deviceId'] as String? ?? '001',
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
      type: json['type'] as String? ?? 'MOVEMENT_DETECTED',
      description: json['description'] as String? ?? 'Suspicious movement detected',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'deviceId': deviceId,
      'timestamp': timestamp.toIso8601String(),
      'type': type,
      'description': description,
    };
  }
}
