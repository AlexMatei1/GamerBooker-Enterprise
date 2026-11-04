import 'package:flutter/material.dart';
import 'models/models.dart';
import 'screens/explore_screen.dart';
import 'screens/seat_picker_screen.dart';
import 'screens/checkout_screen.dart';
import 'screens/boarding_pass_screen.dart';
import 'screens/bar_ordering_screen.dart';
import 'screens/profile_screen.dart';

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
        primaryColor: const Color(0xFF10B981),
        cardColor: const Color(0xFF12131A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF10B981),
          secondary: Color(0xFF6366F1),
          surface: Color(0xFF12131A),
          background: Color(0xFF090A0F),
        ),
        fontFamily: 'sans-serif',
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF090A0F),
          elevation: 0,
        ),
      ),
      home: const MainNavigationShell(),
    );
  }
}

class MainNavigationShell extends StatefulWidget {
  const MainNavigationShell({super.key});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentTabIndex = 0;

  // Booking Flow State
  MobileVenue? _activeVenue;
  StationItem? _pendingStation;
  int _pendingDuration = 2;
  bool _isSelectingSeat = false;
  bool _isCheckingOut = false;

  void _startBookingFlow(MobileVenue venue) {
    setState(() {
      _activeVenue = venue;
      _isSelectingSeat = true;
      _isCheckingOut = false;
    });
  }

  void _proceedToCheckout(StationItem station, int duration) {
    setState(() {
      _pendingStation = station;
      _pendingDuration = duration;
      _isSelectingSeat = false;
      _isCheckingOut = true;
    });
  }

  void _completeBooking() {
    setState(() {
      _isSelectingSeat = false;
      _isCheckingOut = false;
      _currentTabIndex = 1; // Switch to Boarding Pass tab
    });
  }

  void _cancelFlow() {
    setState(() {
      _isSelectingSeat = false;
      _isCheckingOut = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    Widget currentBody;

    if (_currentTabIndex == 0) {
      if (_isCheckingOut && _pendingStation != null) {
        currentBody = CheckoutScreen(
          station: _pendingStation!,
          durationHours: _pendingDuration,
          onBack: () => setState(() => _isCheckingOut = false),
          onBookingSuccess: _completeBooking,
        );
      } else if (_isSelectingSeat && _activeVenue != null) {
        currentBody = SeatPickerScreen(
          venue: _activeVenue!,
          onProceedToCheckout: _proceedToCheckout,
          onBack: _cancelFlow,
        );
      } else {
        currentBody = ExploreScreen(onSelectVenue: _startBookingFlow);
      }
    } else if (_currentTabIndex == 1) {
      currentBody = const BoardingPassScreen();
    } else if (_currentTabIndex == 2) {
      currentBody = BarOrderingScreen(
        onOrderPlaced: (order) {
          // Switch to Pass
          setState(() {
            _currentTabIndex = 1;
          });
        },
      );
    } else {
      currentBody = const ProfileScreen();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      body: SafeArea(
        child: Column(
          children: [
            // Apple Dynamic Island Live Activity Pill
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF12131A),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.08)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Color(0xFF10B981),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'VIP-01',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '• Active Session',
                        style: TextStyle(fontSize: 11, color: const Color(0xFF10B981).withOpacity(0.8), fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.timer, size: 12, color: Colors.white54),
                        SizedBox(width: 4),
                        Text(
                          '01:59:45',
                          style: TextStyle(color: Colors.white, fontSize: 11, fontFamily: 'monospace', fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Main Active View
            Expanded(child: currentBody),
          ],
        ),
      ),

      // Bottom Navigation Bar
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF090A0F),
          border: Border(top: BorderSide(color: Colors.white.withOpacity(0.06))),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentTabIndex,
          onTap: (index) {
            setState(() {
              _currentTabIndex = index;
              if (index != 0) {
                _isSelectingSeat = false;
                _isCheckingOut = false;
              }
            });
          },
          backgroundColor: const Color(0xFF090A0F),
          selectedItemColor: Colors.white,
          unselectedItemColor: Colors.white38,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          type: BottomNavigationBarType.fixed,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.explore_outlined),
              activeIcon: Icon(Icons.explore),
              label: 'Explore',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.confirmation_number_outlined),
              activeIcon: Icon(Icons.confirmation_number),
              label: 'Pass',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.fastfood_outlined),
              activeIcon: Icon(Icons.fastfood),
              label: 'Bar',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline),
              activeIcon: Icon(Icons.person),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
