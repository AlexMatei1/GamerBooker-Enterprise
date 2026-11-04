import 'package:flutter/material.dart';
import 'screens/boarding_pass_screen.dart';

void main() {
  runApp(const GamerBookerApp());
}

class GamerBookerApp extends StatelessWidget {
  const GamerBookerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GamerBooker Arena Pass',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF090A0F),
        primaryColor: const Color(0xFF10B981), // Emerald 500
        cardColor: const Color(0xFF12131A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF10B981),
          secondary: Color(0xFF6366F1),
          surface: Color(0xFF12131A),
          background: Color(0xFF090A0F),
        ),
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF090A0F),
          elevation: 0,
        ),
      ),
      home: const BoardingPassScreen(),
    );
  }
}
