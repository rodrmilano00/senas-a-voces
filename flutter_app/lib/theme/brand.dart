import 'package:flutter/material.dart';

/// Tokens de marca segun brand-spec.md (Senas a Voces).
class Brand {
  // Light
  static const bg = Color(0xFFFAF7ED);
  static const surface = Color(0xFFFFFFFF);
  static const fg = Color(0xFF1A2E35);
  static const muted = Color(0xFF5A7A82);
  static const border = Color(0xFFD4E4E8);
  static const primary = Color(0xFF0D5C6F);
  static const accent = Color(0xFFEC9960);
  static const success = Color(0xFFA8D5BA);
  static const danger = Color(0xFFD96B6B);

  static ThemeData theme() {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        primary: primary,
        secondary: accent,
        surface: surface,
        error: danger,
      ),
      scaffoldBackgroundColor: bg,
      fontFamily: 'Roboto',
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: fg,
        displayColor: fg,
      ),
    );
  }
}
