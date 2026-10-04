import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/biometric_service.dart';
import '../services/api_service.dart';

/// Authentication state provider
class AuthProvider extends ChangeNotifier {
  final BiometricService _biometricService = BiometricService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  bool _isAuthenticated = false;
  bool _biometricAvailable = false;
  bool _isLoading = false;
  bool _lockedOut = false;
  int _remainingSeconds = 0;
  int _attemptsRemaining = 5;
  String? _authToken;
  String? _error;

  bool get isAuthenticated => _isAuthenticated;
  bool get biometricAvailable => _biometricAvailable;
  bool get isLoading => _isLoading;
  bool get lockedOut => _lockedOut;
  int get remainingSeconds => _remainingSeconds;
  int get attemptsRemaining => _attemptsRemaining;
  String? get authToken => _authToken;
  String? get error => _error;

  /// Initialize — check biometric availability
  Future<void> initialize() async {
    _biometricAvailable = await _biometricService.isAvailable();
    notifyListeners();
  }

  /// Authenticate with biometrics (local check only)
  Future<bool> authenticateWithBiometric() async {
    if (!_biometricAvailable) return false;

    _isLoading = true;
    _error = null;
    notifyListeners();

    final success = await _biometricService.authenticate(
      reason: 'Verify your identity to control CycleGuard',
    );

    _isLoading = false;

    if (!success) {
      _error = 'Biometric authentication failed';
    }

    notifyListeners();
    return success;
  }

  /// Verify PIN with backend server and get authToken
  Future<bool> verifyPin(String pin, {String action = 'ARM'}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await ApiService.verifyPin(pin, action);

      _isLoading = false;

      if (result['success'] == true) {
        _authToken = result['authToken'] as String?;
        _isAuthenticated = true;
        _attemptsRemaining = result['attemptsRemaining'] ?? 5;
        _lockedOut = false;

        // Store token securely
        if (_authToken != null) {
          await _storage.write(key: 'auth_token', value: _authToken);
        }

        _error = null;
        notifyListeners();
        return true;
      } else {
        _lockedOut = result['lockedOut'] == true;
        _remainingSeconds = (result['remainingSeconds'] ?? 0) as int;
        _attemptsRemaining = (result['attemptsRemaining'] ?? 0) as int;
        _error = result['error'] as String? ?? 'PIN verification failed';
        notifyListeners();
        return false;
      }
    } catch (e) {
      _isLoading = false;
      _error = 'Connection error. Check your internet.';
      notifyListeners();
      return false;
    }
  }

  /// Full auth flow: biometric + PIN verify
  Future<String?> getAuthTokenForAction(String action, String pin) async {
    // First do biometric if available
    if (_biometricAvailable) {
      final bioSuccess = await authenticateWithBiometric();
      if (!bioSuccess) return null;
    }

    // Then verify PIN with server
    final pinSuccess = await verifyPin(pin, action: action);
    if (!pinSuccess) return null;

    return _authToken;
  }

  /// Logout
  void logout() {
    _isAuthenticated = false;
    _authToken = null;
    _error = null;
    _storage.delete(key: 'auth_token');
    notifyListeners();
  }

  /// Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }
}
