import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../models/models.dart';

class ExploreScreen extends StatefulWidget {
  final ValueChanged<MobileVenue> onSelectVenue;
  const ExploreScreen({super.key, required this.onSelectVenue});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  String query = '';
  @override
  Widget build(BuildContext context) {
    final venues = mockVenues.where((v) => (v.name + ' ' + v.city).toLowerCase().contains(query.toLowerCase())).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Descoperă săli')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Locul tău pentru următoarea sesiune', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const SizedBox(height: 20),
          TextField(
            onChanged: (value) => setState(() => query = value),
            decoration: InputDecoration(
              hintText: 'Caută după sală sau oraș',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: const Color(0xFF12131A),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 22),
          const Text('Săli disponibile', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          if (venues.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Text('Nu am găsit săli pentru această căutare.')),
          ...venues.map((venue) => Card(
            margin: const EdgeInsets.only(bottom: 12),
            color: const Color(0xFF12131A),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => widget.onSelectVenue(venue),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFF164E3D), borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.sports_esports, color: Color(0xFF6EE7B7))),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(venue.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(venue.city + ' • ' + venue.address, style: const TextStyle(color: Colors.white60, fontSize: 12)),
                    ])),
                  ]),
                  const SizedBox(height: 16),
                  Wrap(spacing: 6, runSpacing: 6, children: venue.tags.map((tag) => Chip(label: Text(tag), visualDensity: VisualDensity.compact)).toList()),
                  const SizedBox(height: 8),
                  Row(children: [
                    Text('De la ' + (venue.baseHourlyRate / 100).toStringAsFixed(0) + ' RON/oră', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF6EE7B7))),
                    const Spacer(),
                    const Text('Alege locul  →', style: TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                ]),
              ),
            ),
          )),
        ],
      ),
    );
  }
}
