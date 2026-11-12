import 'package:flutter/material.dart';
import '../models/models.dart';

class BoardingPassScreen extends StatelessWidget {
  final PreviewBooking? booking;
  const BoardingPassScreen({super.key, required this.booking});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Rezervările mele')),
    body: booking == null
      ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Nu ai încă o rezervare activă. Alege o sală din Descoperă.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70))))
      : ListView(padding: const EdgeInsets.all(16), children: [
          Card(color: const Color(0xFF12131A), child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('EXEMPLU • REZERVARE SIMULATĂ', style: TextStyle(color: Color(0xFF6EE7B7), fontSize: 11, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Text(booking!.venue.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(booking!.station.name + ' • ' + booking!.station.zone),
              const SizedBox(height: 8),
              Text('Durată: ' + booking!.durationHours.toString() + ' ore', style: const TextStyle(color: Colors.white70)),
              const Divider(height: 32),
              Text('Total exemplu: ' + (booking!.totalBani / 100).toStringAsFixed(2) + ' RON'),
              const SizedBox(height: 6),
              Text('Avans exemplu: ' + (booking!.depositBani / 100).toStringAsFixed(2) + ' RON'),
              const SizedBox(height: 24),
              const Center(child: Icon(Icons.confirmation_number_outlined, size: 64, color: Color(0xFF6EE7B7))),
              const SizedBox(height: 12),
              const Text('Aceasta nu este o rezervare reală sau un cod de check-in.', style: TextStyle(color: Colors.white70), textAlign: TextAlign.center),
            ]),
          )),
        ]),
  );
}
