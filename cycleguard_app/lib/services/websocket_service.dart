import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config.dart';

/// WebSocket message types from backend
typedef WsMessageHandler = void Function(Map<String, dynamic> message);

/// WebSocket service for real-time device state updates
class WebSocketService {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _intentionalClose = false;

  final List<WsMessageHandler> _handlers = [];

  /// Whether the WebSocket is currently connected
  bool get isConnected => _channel != null;

  /// Register a message handler
  void addHandler(WsMessageHandler handler) {
    _handlers.add(handler);
  }

  /// Remove a message handler
  void removeHandler(WsMessageHandler handler) {
    _handlers.remove(handler);
  }

  /// Connect to WebSocket
  void connect() {
    _intentionalClose = false;
    _reconnectAttempts = 0;
    _doConnect();
  }

  void _doConnect() {
    try {
      _channel?.sink.close();
      _subscription?.cancel();

      _channel = WebSocketChannel.connect(Uri.parse(AppConfig.wsUrl));

      _subscription = _channel!.stream.listen(
        (data) {
          try {
            final message = jsonDecode(data as String) as Map<String, dynamic>;
            for (final handler in _handlers) {
              handler(message);
            }
          } catch (e) {
            // Ignore malformed messages
          }
        },
        onDone: () {
          _channel = null;
          if (!_intentionalClose) {
            _scheduleReconnect();
          }
        },
        onError: (error) {
          _channel = null;
          if (!_intentionalClose) {
            _scheduleReconnect();
          }
        },
      );

      _reconnectAttempts = 0;
    } catch (e) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_intentionalClose) return;
    if (_reconnectAttempts >= AppConfig.wsMaxReconnectAttempts) return;

    _reconnectAttempts++;
    final delay = Duration(
      seconds: AppConfig.wsReconnectDelay.inSeconds * _reconnectAttempts,
    );

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, _doConnect);
  }

  /// Disconnect
  void disconnect() {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;
  }
}
