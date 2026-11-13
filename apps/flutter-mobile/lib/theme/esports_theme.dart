import 'package:flutter/material.dart';

/// Design tokens for GamerBooker Esports Gaming Theme
class EsportsColors {
  // Backgrounds
  static const Color bg = Color(0xFF08090D);
  static const Color surface = Color(0xFF10121B);
  static const Color card = Color(0xFF151824);
  static const Color cardElevated = Color(0xFF1B1F30);
  static const Color cardHover = Color(0xFF22273D);

  // Neon & Esports Accents
  static const Color cyan = Color(0xFF00F0FF);
  static const Color cyanGlow = Color(0x3300F0FF);
  static const Color purple = Color(0xFF7C3AED);
  static const Color purpleGlow = Color(0x337C3AED);
  static const Color indigo = Color(0xFF6366F1);
  static const Color green = Color(0xFF00FF9D);
  static const Color greenGlow = Color(0x3300FF9D);
  static const Color amber = Color(0xFFFFB703);
  static const Color amberGlow = Color(0x33FFB703);
  static const Color crimson = Color(0xFFFF0055);
  static const Color crimsonGlow = Color(0x33FF0055);

  // Typography
  static const Color ink = Color(0xFFF8FAFC);
  static const Color muted = Color(0xFF94A3B8);
  static const Color faint = Color(0xFF64748B);

  // Borders
  static const Color border = Color(0x2600F0FF);
  static const Color borderSubtle = Color(0x14FFFFFF);
  static const Color borderHover = Color(0x6600F0FF);
}

class EsportsTheme {
  static ThemeData get darkTheme {
    return ThemeData.dark().copyWith(
      scaffoldBackgroundColor: EsportsColors.bg,
      colorScheme: const ColorScheme.dark(
        surface: EsportsColors.surface,
        onSurface: EsportsColors.ink,
        primary: EsportsColors.cyan,
        secondary: EsportsColors.purple,
        tertiary: EsportsColors.green,
        error: EsportsColors.crimson,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: EsportsColors.bg,
        foregroundColor: EsportsColors.ink,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
          color: EsportsColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: EsportsColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: EsportsColors.borderSubtle, width: 1),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: EsportsColors.cyan,
          foregroundColor: const Color(0xFF040B11),
          textStyle: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
            letterSpacing: 0.2,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: EsportsColors.surface,
        labelStyle: const TextStyle(color: EsportsColors.muted, fontSize: 14),
        hintStyle: const TextStyle(color: EsportsColors.faint, fontSize: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: EsportsColors.borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: EsportsColors.borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: EsportsColors.cyan, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: EsportsColors.crimson),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}

/// Frosted Glass / Neon border Esports card
class EsportsCard extends StatelessWidget {
  const EsportsCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderColor,
    this.onTap,
    this.gradient,
    this.elevation = 0,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final VoidCallback? onTap;
  final Gradient? gradient;
  final double elevation;

  @override
  Widget build(BuildContext context) {
    final border = borderColor ?? EsportsColors.borderSubtle;
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: gradient == null ? EsportsColors.card : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: 1),
        boxShadow: elevation > 0
            ? [
                BoxShadow(
                  color: (borderColor ?? EsportsColors.cyan).withValues(alpha: 0.15),
                  blurRadius: 16,
                  spreadRadius: -2,
                )
              ]
            : null,
      ),
      child: child,
    );

    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: content,
        ),
      );
    }
    return content;
  }
}

/// Esports Tech Badge with optional pulsing LED dot
class EsportsBadge extends StatelessWidget {
  const EsportsBadge({
    super.key,
    required this.text,
    this.color = EsportsColors.cyan,
    this.hasLed = false,
    this.fontSize = 11,
  });

  final String text;
  final Color color;
  final bool hasLed;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (hasLed) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 4, spreadRadius: 1),
                ],
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
