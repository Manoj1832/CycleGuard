# Flutter Rules
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.**  { *; }

# FlutterFragmentActivity & Biometrics (local_auth)
-keep class androidx.biometric.** { *; }
-keep class androidx.fragment.app.** { *; }
-dontwarn androidx.biometric.**

# Firebase Messaging & Core
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

# Desugaring
-dontwarn java.time.**

# Play Store deferred components (optional in Flutter)
-dontwarn com.google.android.play.core.**

