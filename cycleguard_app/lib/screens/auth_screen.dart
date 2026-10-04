import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../theme/app_theme.dart';
import 'dashboard_screen.dart';

/// Authentication screen — PIN entry with optional biometric
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen>
    with SingleTickerProviderStateMixin {
  final List<String> _pin = [];
  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(begin: 0, end: 10).animate(
      CurvedAnimation(parent: _shakeController, curve: Curves.elasticIn),
    );

    // Initialize biometric service
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      auth.initialize();
    });
  }

  @override
  void dispose() {
    _shakeController.dispose();
    super.dispose();
  }

  void _onDigitPressed(String digit) {
    if (_pin.length >= 4) return;

    HapticFeedback.lightImpact();
    setState(() {
      _pin.add(digit);
    });

    if (_pin.length == 4) {
      _submitPin();
    }
  }

  void _onBackspace() {
    if (_pin.isEmpty) return;
    HapticFeedback.lightImpact();
    setState(() {
      _pin.removeLast();
    });
  }

  Future<void> _submitPin() async {
    final auth = context.read<AuthProvider>();
    final pin = _pin.join();

    final success = await auth.verifyPin(pin);

    if (!mounted) return;

    if (success) {
      HapticFeedback.mediumImpact();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } else {
      HapticFeedback.heavyImpact();
      _shakeController.forward(from: 0);
      setState(() {
        _pin.clear();
      });
    }
  }

  Future<void> _onBiometricPressed() async {
    final auth = context.read<AuthProvider>();
    final success = await auth.authenticateWithBiometric();

    if (!mounted) return;

    if (success) {
      HapticFeedback.mediumImpact();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: SafeArea(
          child: Consumer<AuthProvider>(
            builder: (context, auth, _) {
              return Column(
                children: [
                  const SizedBox(height: 60),

                  // Lock icon
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.card,
                      border: Border.all(
                        color: AppTheme.primary.withValues(alpha: 0.3),
                        width: 2,
                      ),
                    ),
                    child: Icon(
                      auth.lockedOut ? Icons.lock_outline : Icons.lock_open_rounded,
                      size: 36,
                      color: auth.lockedOut ? AppTheme.danger : AppTheme.primary,
                    ),
                  ),

                  const SizedBox(height: 24),

                  Text(
                    auth.lockedOut ? 'Account Locked' : 'Enter PIN',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),

                  const SizedBox(height: 8),

                  if (auth.lockedOut)
                    Text(
                      'Try again in ${auth.remainingSeconds}s',
                      style: const TextStyle(color: AppTheme.danger, fontSize: 14),
                    )
                  else if (auth.error != null)
                    Text(
                      auth.error!,
                      style: const TextStyle(color: AppTheme.danger, fontSize: 14),
                    )
                  else
                    const Text(
                      'Enter your 4-digit security PIN',
                      style: TextStyle(color: AppTheme.textMuted, fontSize: 14),
                    ),

                  const SizedBox(height: 40),

                  // PIN dots
                  AnimatedBuilder(
                    animation: _shakeAnimation,
                    builder: (context, child) {
                      return Transform.translate(
                        offset: Offset(
                          _shakeController.isAnimating
                              ? _shakeAnimation.value *
                                  (_shakeController.value > 0.5 ? -1 : 1)
                              : 0,
                          0,
                        ),
                        child: child,
                      );
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(4, (index) {
                        final filled = index < _pin.length;
                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 12),
                          width: filled ? 20 : 16,
                          height: filled ? 20 : 16,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: filled
                                ? AppTheme.primary
                                : Colors.transparent,
                            border: Border.all(
                              color: filled
                                  ? AppTheme.primary
                                  : AppTheme.textMuted.withValues(alpha: 0.3),
                              width: 2,
                            ),
                            boxShadow: filled
                                ? [
                                    BoxShadow(
                                      color: AppTheme.primary.withValues(alpha: 0.4),
                                      blurRadius: 8,
                                      spreadRadius: 1,
                                    ),
                                  ]
                                : null,
                          ),
                        );
                      }),
                    ),
                  ),

                  const Spacer(),

                  // Number pad
                  if (!auth.lockedOut)
                    _buildNumPad(auth),

                  const SizedBox(height: 32),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildNumPad(AuthProvider auth) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 48),
      child: Column(
        children: [
          // Rows 1-3
          for (int row = 0; row < 3; row++)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (int col = 1; col <= 3; col++)
                    _buildDigitButton('${row * 3 + col}'),
                ],
              ),
            ),

          // Bottom row: biometric, 0, backspace
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Biometric button
              if (auth.biometricAvailable)
                _buildActionButton(
                  icon: Icons.fingerprint,
                  onTap: auth.isLoading ? null : _onBiometricPressed,
                  color: AppTheme.primary,
                )
              else
                const SizedBox(width: 72),

              _buildDigitButton('0'),

              // Backspace
              _buildActionButton(
                icon: Icons.backspace_outlined,
                onTap: _pin.isEmpty ? null : _onBackspace,
                color: AppTheme.textSecondary,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDigitButton(String digit) {
    return GestureDetector(
      onTap: () => _onDigitPressed(digit),
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTheme.card,
          border: Border.all(
            color: AppTheme.divider,
            width: 1,
          ),
        ),
        child: Center(
          child: Text(
            digit,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w500,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required VoidCallback? onTap,
    required Color color,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 72,
        height: 72,
        child: Center(
          child: Icon(
            icon,
            size: 28,
            color: onTap != null ? color : color.withValues(alpha: 0.3),
          ),
        ),
      ),
    );
  }
}
