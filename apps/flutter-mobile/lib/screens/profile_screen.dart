import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: AppBar(
        title: const Text(
          'PLAYER PROFILE',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1.5, color: Colors.white70),
        ),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // Player Avatar & Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF12131A),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                  ),
                  child: const Center(
                    child: Text('AM', style: TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.w900, fontSize: 20)),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Alex M.',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'alexamtei2330@gmail.com',
                        style: TextStyle(fontSize: 12, color: Colors.white54),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF818CF8).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          '★ ELITE PRO TIER',
                          style: TextStyle(color: Color(0xFF818CF8), fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Stats Grid
          Row(
            children: [
              _buildStatCard('HOURS PLAYED', '142h', Icons.timer_outlined, const Color(0xFF10B981)),
              const SizedBox(width: 12),
              _buildStatCard('SESSIONS', '38', Icons.videogame_asset_outlined, const Color(0xFF6366F1)),
            ],
          ),
          const SizedBox(height: 16),

          // Legal Compliance Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF12131A),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.verified_user_outlined, color: Color(0xFF34D399), size: 20),
                    const SizedBox(width: 8),
                    const Text(
                      'Statutory Age Compliance',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Romanian Law 42/2024 & O.U.G. 97/2005 verified. Eligible for overnight sessions (22:00 – 06:00) and energy beverage orders.',
                  style: TextStyle(fontSize: 12, color: Colors.white54, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // App Settings & Preferences
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF12131A),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.notifications_none, color: Colors.white70),
                  title: const Text('Push Notifications', style: TextStyle(color: Colors.white, fontSize: 14)),
                  trailing: const Text('Active', style: TextStyle(color: Color(0xFF34D399), fontSize: 12, fontWeight: FontWeight.bold)),
                ),
                const Divider(height: 1, color: Colors.white12),
                ListTile(
                  leading: const Icon(Icons.sms_outlined, color: Colors.white70),
                  title: const Text('SMS OTP Fast Pass', style: TextStyle(color: Colors.white, fontSize: 14)),
                  trailing: const Text('+40 7xx xxx xxx', style: TextStyle(color: Colors.white54, fontSize: 12)),
                ),
                const Divider(height: 1, color: Colors.white12),
                ListTile(
                  leading: const Icon(Icons.shield_outlined, color: Colors.white70),
                  title: const Text('Privacy & ANAF Invoicing', style: TextStyle(color: Colors.white, fontSize: 14)),
                  trailing: const Icon(Icons.chevron_right, color: Colors.white38),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF12131A),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 12),
            Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 10, color: Colors.white38, fontWeight: FontWeight.w600, letterSpacing: 1.0)),
          ],
        ),
      ),
    );
  }
}
