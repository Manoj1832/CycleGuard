import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/device_state.dart';
import '../providers/auth_provider.dart';
import '../providers/device_provider.dart';
import '../theme/app_theme.dart';
import 'auth_screen.dart';

/// Main dashboard — device control, status, and activity log
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late AnimationController _alarmController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _alarmAnimation;

  @override
  void initState() {
    super.initState();

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _alarmController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.95, end: 1.05).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _alarmAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _alarmController, curve: Curves.easeInOut),
    );

    // Initialize WebSocket connection
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DeviceProvider>().initialize();
    });
  }

  Timer? _alarmAudioTimer;
  bool _lastAlarmState = false;

  void _syncAlarmAudio(bool isAlarm) {
    if (isAlarm == _lastAlarmState) return;
    _lastAlarmState = isAlarm;

    if (isAlarm) {
      _alarmAudioTimer?.cancel();
      _playAlarmAlert();
      _alarmAudioTimer = Timer.periodic(const Duration(milliseconds: 700), (_) {
        _playAlarmAlert();
      });
    } else {
      _alarmAudioTimer?.cancel();
      _alarmAudioTimer = null;
    }
  }

  void _playAlarmAlert() {
    SystemSound.play(SystemSoundType.alert);
    HapticFeedback.heavyImpact();
  }

  @override
  void dispose() {
    _alarmAudioTimer?.cancel();
    _pulseController.dispose();
    _alarmController.dispose();
    super.dispose();
  }

  Future<void> _onToggleSecurity() async {
    final device = context.read<DeviceProvider>();
    final auth = context.read<AuthProvider>();
    final state = device.deviceState;

    if (state.pending) return;

    // Re-authenticate for every ARM/DISARM action
    final action = state.isArmed || state.isAlarm ? 'DISARM' : 'ARM';

    // Show PIN dialog
    final pin = await _showPinDialog(action);
    if (pin == null || !mounted) return;

    // Verify PIN to get fresh authToken
    final success = await auth.verifyPin(pin, action: action);
    if (!success || auth.authToken == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(auth.error ?? 'Authentication failed'),
            backgroundColor: AppTheme.danger,
          ),
        );
      }
      return;
    }

    HapticFeedback.mediumImpact();

    bool commandSuccess;
    if (state.isAlarm) {
      commandSuccess = await device.clearAlarm(auth.authToken!);
    } else if (state.isArmed) {
      commandSuccess = await device.disarmDevice(auth.authToken!);
    } else {
      commandSuccess = await device.armDevice(auth.authToken!);
    }

    if (!commandSuccess && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(device.error ?? 'Command failed'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  Future<String?> _showPinDialog(String action) async {
    final pinDigits = <String>[];
    final controller = TextEditingController();

    return showDialog<String>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              backgroundColor: AppTheme.card,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              title: Column(
                children: [
                  Icon(
                    action == 'ARM' ? Icons.shield : Icons.shield_outlined,
                    color: action == 'ARM' ? AppTheme.primary : AppTheme.warning,
                    size: 36,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Enter PIN to $action',
                    style: const TextStyle(fontSize: 18),
                  ),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // PIN dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(4, (i) {
                      final filled = i < pinDigits.length;
                      return Container(
                        margin: const EdgeInsets.symmetric(horizontal: 8),
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: filled ? AppTheme.primary : Colors.transparent,
                          border: Border.all(
                            color: filled ? AppTheme.primary : AppTheme.textMuted,
                            width: 2,
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 24),

                  // Hidden text field for keyboard input
                  SizedBox(
                    width: 0,
                    height: 0,
                    child: TextField(
                      controller: controller,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      maxLength: 4,
                      onChanged: (val) {
                        setDialogState(() {
                          pinDigits.clear();
                          pinDigits.addAll(val.split(''));
                        });
                        if (val.length == 4) {
                          Navigator.of(ctx).pop(val);
                        }
                      },
                    ),
                  ),

                  // Compact numpad for the dialog
                  _buildDialogNumPad(pinDigits, setDialogState, ctx),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildDialogNumPad(
    List<String> pinDigits,
    void Function(VoidCallback) setDialogState,
    BuildContext dialogContext,
  ) {
    void onDigit(String d) {
      if (pinDigits.length >= 4) return;
      HapticFeedback.lightImpact();
      setDialogState(() => pinDigits.add(d));
      if (pinDigits.length == 4) {
        Navigator.of(dialogContext).pop(pinDigits.join());
      }
    }

    void onBackspace() {
      if (pinDigits.isEmpty) return;
      HapticFeedback.lightImpact();
      setDialogState(() => pinDigits.removeLast());
    }

    return Column(
      children: [
        for (int row = 0; row < 3; row++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (int col = 1; col <= 3; col++)
                  _dialogDigit('${row * 3 + col}', onDigit),
              ],
            ),
          ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            const SizedBox(width: 56),
            _dialogDigit('0', onDigit),
            GestureDetector(
              onTap: onBackspace,
              child: const SizedBox(
                width: 56,
                height: 56,
                child: Icon(Icons.backspace_outlined, color: AppTheme.textSecondary, size: 22),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _dialogDigit(String digit, void Function(String) onTap) {
    return GestureDetector(
      onTap: () => onTap(digit),
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTheme.surface,
        ),
        child: Center(
          child: Text(
            digit,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w500),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DeviceProvider>(
      builder: (context, device, _) {
        final state = device.deviceState;
        _syncAlarmAudio(state.isAlarm);

        return Scaffold(
          body: Container(
            decoration: const BoxDecoration(gradient: AppTheme.backgroundGradient),
            child: SafeArea(
              child: Column(
                children: [
                  // App bar
                  _buildAppBar(context),

                  Expanded(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Column(
                          children: [
                            const SizedBox(height: 16),

                            // Device status card
                            _buildStatusCard(state),

                            const SizedBox(height: 32),

                            // Main security button
                            _buildSecurityButton(state),

                            const SizedBox(height: 32),

                            // Alarm banner
                            if (state.isAlarm)
                              _buildAlarmBanner(),

                            if (state.isAlarm)
                              const SizedBox(height: 16),

                            // Activity log
                            _buildActivityLog(device),

                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: AppTheme.primaryGradient,
            ),
            child: const Icon(Icons.shield, size: 20, color: Colors.black),
          ),
          const SizedBox(width: 12),
          const Text(
            'CycleGuard',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
              letterSpacing: 1,
            ),
          ),
          const Spacer(),
          IconButton(
            onPressed: () {
              context.read<AuthProvider>().logout();
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const AuthScreen()),
              );
            },
            icon: const Icon(Icons.logout_rounded, color: AppTheme.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusCard(DeviceState state) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: state.isOnline
              ? AppTheme.primary.withValues(alpha: 0.2)
              : AppTheme.danger.withValues(alpha: 0.2),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          // Status dot
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: state.isOnline ? AppTheme.primary : AppTheme.danger,
              boxShadow: [
                BoxShadow(
                  color: (state.isOnline ? AppTheme.primary : AppTheme.danger)
                      .withValues(alpha: 0.5),
                  blurRadius: 8,
                  spreadRadius: 2,
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Device ${state.deviceId}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  state.isOnline ? 'Connected' : 'Offline',
                  style: TextStyle(
                    fontSize: 13,
                    color: state.isOnline ? AppTheme.primary : AppTheme.danger,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          // Security state badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: _getStateBadgeColor(state).withValues(alpha: 0.15),
            ),
            child: Text(
              _getStateLabel(state),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _getStateBadgeColor(state),
                letterSpacing: 1,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getStateBadgeColor(DeviceState state) {
    if (state.isAlarm) return AppTheme.danger;
    if (state.isArmed) return AppTheme.primary;
    return AppTheme.textMuted;
  }

  String _getStateLabel(DeviceState state) {
    if (state.pending) return 'PENDING...';
    if (state.isAlarm) return 'ALARM';
    if (state.isArmed) return 'ARMED';
    return 'DISARMED';
  }

  Widget _buildSecurityButton(DeviceState state) {
    final isAlarm = state.isAlarm;
    final isArmed = state.isArmed;
    final isPending = state.pending;

    Color buttonColor;
    Color glowColor;
    IconData buttonIcon;
    String buttonLabel;

    if (isAlarm) {
      buttonColor = AppTheme.danger;
      glowColor = AppTheme.danger;
      buttonIcon = Icons.warning_amber_rounded;
      buttonLabel = 'CLEAR ALARM';
    } else if (isArmed) {
      buttonColor = AppTheme.primary;
      glowColor = AppTheme.primary;
      buttonIcon = Icons.lock_rounded;
      buttonLabel = 'DISARM';
    } else {
      buttonColor = AppTheme.textMuted;
      glowColor = AppTheme.primary;
      buttonIcon = Icons.lock_open_rounded;
      buttonLabel = 'ARM';
    }

    return Column(
      children: [
        GestureDetector(
          onTap: isPending ? null : _onToggleSecurity,
          child: AnimatedBuilder(
            animation: isAlarm ? _alarmAnimation : _pulseAnimation,
            builder: (context, child) {
              final scale = isAlarm
                  ? 1.0 + (_alarmAnimation.value * 0.05)
                  : (isArmed ? _pulseAnimation.value : 1.0);

              return Transform.scale(
                scale: scale,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isPending
                        ? AppTheme.card
                        : buttonColor.withValues(alpha: 0.15),
                    border: Border.all(
                      color: isPending
                          ? AppTheme.textMuted.withValues(alpha: 0.3)
                          : buttonColor.withValues(alpha: 0.6),
                      width: 3,
                    ),
                    boxShadow: [
                      if (!isPending)
                        BoxShadow(
                          color: glowColor.withValues(
                            alpha: isAlarm
                                ? 0.3 + (_alarmAnimation.value * 0.3)
                                : (isArmed ? 0.2 : 0.05),
                          ),
                          blurRadius: isAlarm ? 40 : 30,
                          spreadRadius: isAlarm ? 10 : 5,
                        ),
                    ],
                  ),
                  child: isPending
                      ? const Center(
                          child: SizedBox(
                            width: 40,
                            height: 40,
                            child: CircularProgressIndicator(
                              strokeWidth: 3,
                              color: AppTheme.primary,
                            ),
                          ),
                        )
                      : Icon(buttonIcon, size: 56, color: buttonColor),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 20),
        Text(
          isPending ? 'Sending command...' : buttonLabel,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: isPending ? AppTheme.textMuted : buttonColor,
            letterSpacing: 2,
          ),
        ),
      ],
    );
  }

  Widget _buildAlarmBanner() {
    return AnimatedBuilder(
      animation: _alarmAnimation,
      builder: (context, child) {
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: AppTheme.danger
                .withValues(alpha: 0.1 + (_alarmAnimation.value * 0.1)),
            border: Border.all(
              color: AppTheme.danger.withValues(alpha: 0.5),
              width: 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                Icons.warning_amber_rounded,
                color: AppTheme.danger,
                size: 28,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'MOVEMENT DETECTED',
                      style: TextStyle(
                        color: AppTheme.danger,
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        letterSpacing: 1,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Suspicious activity on your bicycle!',
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildActivityLog(DeviceProvider device) {
    final events = device.activityLog;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Row(
              children: [
                Icon(Icons.history, size: 18, color: AppTheme.textMuted),
                SizedBox(width: 8),
                Text(
                  'Activity Log',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: AppTheme.divider, height: 1),
          if (events.isEmpty)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(
                child: Text(
                  'No activity yet',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                ),
              ),
            )
          else
            ...events.take(8).map((event) => _buildActivityItem(event)),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _buildActivityItem(ActivityEvent event) {
    final time = '${event.timestamp.hour.toString().padLeft(2, '0')}:'
        '${event.timestamp.minute.toString().padLeft(2, '0')}:'
        '${event.timestamp.second.toString().padLeft(2, '0')}';

    final isAlert = event.description.contains('⚠️') ||
        event.description.contains('🔴') ||
        event.description.contains('ALARM');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isAlert ? AppTheme.danger : AppTheme.primary.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              event.description,
              style: TextStyle(
                fontSize: 13,
                color: isAlert ? AppTheme.danger : AppTheme.textSecondary,
                fontWeight: isAlert ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            time,
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.textMuted,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}
