import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../models/models.dart';

class SeatPickerScreen extends StatefulWidget {
  final MobileVenue venue;
  final void Function(StationItem, int) onProceedToCheckout;
  final VoidCallback onBack;
  const SeatPickerScreen({super.key, required this.venue, required this.onProceedToCheckout, required this.onBack});
  @override
  State<SeatPickerScreen> createState() => _SeatPickerScreenState();
}

class _SeatPickerScreenState extends State<SeatPickerScreen> {
  StationItem? selected;
  int hours = 2;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(leading: BackButton(onPressed: widget.onBack), title: Text(widget.venue.name, style: const TextStyle(fontSize: 16))),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Alege un loc', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
      const SizedBox(height: 6),
      const SizedBox(height: 16),
      ...mockStations.map((item) {
        final available = item.status == 'AVAILABLE';
        final chosen = selected?.id == item.id;
        return Card(
          color: chosen ? const Color(0xFF164E3D) : const Color(0xFF12131A),
          child: ListTile(
            enabled: available,
            onTap: available ? () => setState(() => selected = item) : null,
            leading: Icon(item.name.startsWith('PS') ? Icons.sports_esports : Icons.computer),
            title: Text(item.name + ' • ' + item.zone),
            subtitle: Text(item.gpu + '\n' + (available ? 'Disponibil • ' : 'Ocupat • ') + (item.hourlyRate / 100).toStringAsFixed(0) + ' RON/oră'),
            isThreeLine: true,
            trailing: chosen ? const Icon(Icons.check_circle, color: Color(0xFF6EE7B7)) : null,
          ),
        );
      }),
      const SizedBox(height: 18),
      const Text('Durată', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, children: [1, 2, 3, 4].map((h) => ChoiceChip(label: Text(h.toString() + ' h'), selected: hours == h, onSelected: (_) => setState(() => hours = h))).toList()),
      const SizedBox(height: 20),
      FilledButton(
        onPressed: selected == null ? null : () => widget.onProceedToCheckout(selected!, hours),
        child: const Text('Continuă'),
      ),
    ]),
  );
}
