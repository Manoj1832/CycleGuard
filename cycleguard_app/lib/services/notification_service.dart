import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_service.dart';

/// Top-level background message handler required by Firebase Messaging
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM] Background message: ${message.messageId}');
}

/// CycleGuard Notification Service — handles FCM and local foreground alerts
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  late final FirebaseMessaging _fcm;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static final Int64List _vibrationPattern =
      Int64List.fromList([0, 800, 200, 800, 200, 800]);

  static final AndroidNotificationChannel _alarmChannel =
      AndroidNotificationChannel(
    'cycleguard_alerts',
    'CycleGuard Security Alerts',
    description: 'High-priority vibration and tamper security alerts',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    vibrationPattern: _vibrationPattern,
    audioAttributesUsage: AudioAttributesUsage.alarm,
  );

  bool _initialized = false;
  String? _fcmToken;
  String? get fcmToken => _fcmToken;

  /// Initialize Firebase Messaging & local notifications
  Future<void> initialize({Function(Map<String, dynamic>)? onNotificationTap}) async {
    if (_initialized) return;

    try {
      // 1. Initialize Firebase App
      await Firebase.initializeApp();
      _fcm = FirebaseMessaging.instance;

      // 2. Set background message handler
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      // 3. Request permissions (iOS and Android 13+)
      final settings = await _fcm.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: true,
        provisional: false,
        sound: true,
      );

      debugPrint('[FCM] Permission status: ${settings.authorizationStatus}');

      // 4. Configure local notification channel for Android
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_alarmChannel);

      // 5. Initialize local notifications
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );

      await _localNotifications.initialize(
        settings: const InitializationSettings(
          android: androidInit,
          iOS: iosInit,
        ),
        onDidReceiveNotificationResponse: (response) {
          if (response.payload != null && onNotificationTap != null) {
            try {
              final data = jsonDecode(response.payload!) as Map<String, dynamic>;
              onNotificationTap(data);
            } catch (_) {}
          }
        },
      );

      // 6. Get and register FCM token
      _fcmToken = await _fcm.getToken();
      debugPrint('[FCM] Device Token: $_fcmToken');
      if (_fcmToken != null) {
        await ApiService.registerFcmToken(_fcmToken!);
      }

      // Listen for token refresh
      _fcm.onTokenRefresh.listen((newToken) {
        _fcmToken = newToken;
        ApiService.registerFcmToken(newToken);
      });

      // 7. Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('[FCM] Foreground message received: ${message.data}');
        _showForegroundNotification(message);
      });

      // 8. Handle notification tap when opened from background
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('[FCM] App opened from notification: ${message.data}');
        if (onNotificationTap != null) {
          onNotificationTap(message.data);
        }
      });

      _initialized = true;
    } catch (e) {
      debugPrint('[FCM] Initialization warning: $e');
    }
  }

  /// Show heads-up notification in foreground
  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    final android = message.notification?.android;

    if (notification != null) {
      await _localNotifications.show(
        id: notification.hashCode,
        title: notification.title ?? '⚠️ CycleGuard Alert',
        body: notification.body ?? 'Suspicious movement detected on your bicycle!',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            _alarmChannel.id,
            _alarmChannel.name,
            channelDescription: _alarmChannel.description,
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.alarm,
            audioAttributesUsage: AudioAttributesUsage.alarm,
            vibrationPattern: _vibrationPattern,
            fullScreenIntent: true,
            icon: android?.smallIcon ?? '@mipmap/ic_launcher',
            playSound: true,
            enableVibration: true,
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
            sound: 'default',
            interruptionLevel: InterruptionLevel.critical,
          ),
        ),
        payload: jsonEncode(message.data),
      );
    }
  }
}
