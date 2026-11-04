import 'dart:async';
import 'package:flutter/material.dart';

class BoardingPassScreen extends StatefulWidget {
  const BoardingPassScreen({super.key});

  @override
  State<BoardingPassScreen> createState() => _BoardingPassScreenState();
}

class _BoardingPassScreenState extends State<BoardingPassScreen> {
  int _secondsRemaining = 7200; // 2 hours
  Timer? _timer;
  bool _staffCalled = false;
  String _totalRon = "115.00";

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsRemaining > 0) {
        setState(() {
          _secondsRemaining--;
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatTime(int totalSeconds) {
    final hours = totalSeconds ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    final seconds = totalSeconds % 60;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  void _extendOneHour() {
    setState(() {
      _secondsRemaining += 3600;
      final currentTotal = double.tryParse(_totalRon) ?? 115.0;
      _totalRon = (currentTotal + 50.0).toStringAsFixed(2);
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF064E3B),
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Color(0xFF34D399), size: 20),
            const SizedBox(width: 8),
            Text(
              '✓ Added +1 Hour (3,600s)! New total: $_totalRon RON',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
            ),
          ],
        ),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _callStaff() {
    setState(() {
      _staffCalled = true;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: Color(0xFF78350F),
        content: Row(
          children: [
            Icon(Icons.notifications_active, color: Color(0xFFFBBF24), size: 20),
            SizedBox(width: 8),
            Text(
              '🚨 Staff requested at VIP-01. A floor manager is on the way!',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
            ),
          ],
        ),
        duration: Duration(seconds: 4),
      ),
    );

    Future.delayed(const Duration(seconds: 6), () {
      if (mounted) {
        setState(() {
          _staffCalled = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: AppBar(
        title: const Text(
          'BOARDING PASS',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: Colors.white70),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline, color: Colors.white70),
            onPressed: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: const Color(0xFF12131A),
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                builder: (ctx) => Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Rig Specifications & Wi-Fi',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      const SizedBox(height: 16),
                      const ListTile(
                        leading: Icon(Icons.wifi, color: Color(0xFF10B981)),
                        title: Text('Arena 10Gbps Wi-Fi'),
                        subtitle: Text('SSID: NEXUS-ARENA-5G • Pass: NexusVIP2026'),
                      ),
                      const ListTile(
                        leading: Icon(Icons.memory, color: Color(0xFF6366F1)),
                        title: Text('NVIDIA GeForce RTX 4090 24GB'),
                        subtitle: Text('AMD Ryzen 7 7800X3D • 360Hz Fast-IPS Display'),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // Apple Wallet Style Card
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFF12131A),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.6),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Venue Header Bar
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF181922),
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                      border: Border.bottom(color: Colors.white.withOpacity(0.06)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Nexus Gaming Arena Bucharest',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Turnstile Gate 1 • VIP Stage Arena',
                              style: TextStyle(fontSize: 10, color: Colors.white54),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                          ),
                          child: const Text(
                            'ACTIVE',
                            style: TextStyle(
                              color: Color(0xFF34D399),
                              fontWeight: FontWeight.bold,
                              fontSize: 10,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Station & Big Timer
                  Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      children: [
                        const Text(
                          'ASSIGNED WORKSTATION',
                          style: TextStyle(fontSize: 11, letterSpacing: 1.2, color: Colors.white54, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'VIP-01 (RTX 4090)',
                          style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.white),
                        ),
                        const SizedBox(height: 18),

                        // Countdown Box
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.5),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withOpacity(0.08)),
                          ),
                          child: Column(
                            children: [
                              const Text(
                                'SESSION REMAINING',
                                style: TextStyle(fontSize: 10, letterSpacing: 1.5, color: Colors.white38, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatTime(_secondsRemaining),
                                style: const TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.bold,
                                  fontFamily: 'monospace',
                                  color: Color(0xFF34D399),
                                ),
                              ),
                              const SizedBox(height: 8),
                              // Progress bar
                              ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: LinearProgressIndicator(
                                  value: (_secondsRemaining / 10800).clamp(0.05, 1.0),
                                  backgroundColor: Colors.white12,
                                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF10B981)),
                                  minHeight: 4,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // QR Code Box Placeholder
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.qr_code_2, size: 140, color: Colors.black),
                              const SizedBox(height: 4),
                              Text(
                                'OTP: 89A7B3',
                                style: TextStyle(
                                  color: Colors.black.withOpacity(0.8),
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 2,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Scan at turnstile or enter PIN on PC screen',
                          style: TextStyle(fontSize: 11, color: Colors.white54),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Action Buttons
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    icon: const Icon(Icons.add_circle_outline, color: Color(0xFF059669)),
                    label: const Text('Extend (+1h)', style: TextStyle(fontWeight: FontWeight.bold)),
                    onPressed: _extendOneHour,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withOpacity(0.15)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    icon: Icon(
                      _staffCalled ? Icons.check : Icons.room_service_outlined,
                      color: _staffCalled ? const Color(0xFF34D399) : Colors.white70,
                    ),
                    label: Text(
                      _staffCalled ? 'Called' : 'Call Staff',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    onPressed: _callStaff,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
