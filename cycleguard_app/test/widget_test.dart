import 'package:flutter_test/flutter_test.dart';
import 'package:cycleguard_app/models/device_state.dart';
import 'package:cycleguard_app/models/alert.dart';

void main() {
  group('CycleGuard Models Tests', () {
    test('DeviceState default values and computed getters', () {
      const state = DeviceState(deviceId: '001');
      expect(state.deviceId, equals('001'));
      expect(state.securityState, equals('OFF'));
      expect(state.isArmed, isFalse);
      expect(state.isAlarm, isFalse);
      expect(state.isOnline, isFalse);
      expect(state.pending, isFalse);
    });

    test('DeviceState armed and alarm states', () {
      const armedState = DeviceState(
        deviceId: '001',
        securityState: 'ON',
        connectionState: 'ONLINE',
      );
      expect(armedState.isArmed, isTrue);
      expect(armedState.isAlarm, isFalse);
      expect(armedState.isOnline, isTrue);

      const alarmState = DeviceState(
        deviceId: '001',
        securityState: 'ALARM',
        alarmActive: true,
      );
      expect(alarmState.isAlarm, isTrue);
    });

    test('MovementAlert serialization', () {
      final now = DateTime.now();
      final alert = MovementAlert(
        deviceId: '001',
        timestamp: now,
        type: 'MOVEMENT_DETECTED',
        description: 'Vibration detected',
      );

      expect(alert.deviceId, equals('001'));
      expect(alert.type, equals('MOVEMENT_DETECTED'));

      final json = alert.toJson();
      expect(json['deviceId'], equals('001'));
      expect(json['type'], equals('MOVEMENT_DETECTED'));

      final parsed = MovementAlert.fromJson(json);
      expect(parsed.deviceId, equals('001'));
      expect(parsed.type, equals('MOVEMENT_DETECTED'));
    });
  });
}
