import 'package:flutter/material.dart';
import '../models/models.dart';

class CheckoutScreen extends StatelessWidget {
  final MobileVenue venue;
  final StationItem station;
  final int durationHours;
  final VoidCallback onBack;
  final VoidCallback onBookingSuccess;
  const CheckoutScreen({super.key, required this.venue, required this.station, required this.durationHours, required this.onBack, required this.onBookingSuccess});

  @override
  Widget build(BuildContext context) {
    final total = station.hourlyRate * durationHours;
    final deposit = (total * 40 + 50) ~/ 100;
    String money(int bani) => (bani / 100).toStringAsFixed(2) + ' RON';
    return Scaffold(
      appBar: AppBar(leading: BackButton(onPressed: onBack), title: const Text('Sumar rezervare')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(color: const Color(0xFF12131A), child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(venue.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(station.name + ' • ' + durationHours.toString() + ' ore', style: const TextStyle(color: Colors.white70)),
            const Divider(height: 32),
            _row('Total exemplu', money(total)),
            const SizedBox(height: 10),
            _row('Avans exemplu (40%)', money(deposit)),
            const SizedBox(height: 10),
            _row('Rest exemplu', money(total - deposit)),
          ]),
        )),
        const SizedBox(height: 20),
        const SizedBox(height: 20),
        FilledButton(onPressed: onBookingSuccess, child: const Text('Simulează rezervarea')),
      ]),
    );
  }
  Widget _row(String label, String value) => Row(children: [Expanded(child: Text(label, style: const TextStyle(color: Colors.white70))), Text(value, style: const TextStyle(fontWeight: FontWeight.bold))]);
}
