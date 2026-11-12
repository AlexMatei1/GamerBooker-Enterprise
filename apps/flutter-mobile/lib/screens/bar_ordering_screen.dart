import 'package:flutter/material.dart';
import '../data/mock_data.dart';

class BarOrderingScreen extends StatefulWidget {
  const BarOrderingScreen({super.key});
  @override
  State<BarOrderingScreen> createState() => _BarOrderingScreenState();
}
class _BarOrderingScreenState extends State<BarOrderingScreen> {
  final Map<String, int> cart = {};
  @override
  Widget build(BuildContext context) {
    final total = mockMenuItems.fold<int>(0, (sum, item) => sum + item.price * (cart[item.id] ?? 0));
    final count = cart.values.fold<int>(0, (sum, amount) => sum + amount);
    return Scaffold(
      appBar: AppBar(title: const Text('Meniu Bar & Snacks')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Explorează meniul', style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        const Text('Coșul este o simulare locală; nu se trimite nicio comandă.', style: TextStyle(color: Colors.white70)),
        const SizedBox(height: 16),
        ...mockMenuItems.map((item) {
          final quantity = cart[item.id] ?? 0;
          return Card(
            color: const Color(0xFF12131A),
            child: ListTile(
              leading: Text(item.imageIcon, style: const TextStyle(fontSize: 24)),
              title: Text(item.name),
              subtitle: Text((item.price / 100).toStringAsFixed(2) + ' RON' + (item.requiresAgeVerification ? ' • verificare la predare' : '')),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                if (quantity > 0) IconButton(tooltip: 'Elimină', onPressed: () => setState(() { if (quantity == 1) { cart.remove(item.id); } else { cart[item.id] = quantity - 1; } }), icon: const Icon(Icons.remove_circle_outline)),
                if (quantity > 0) Text(quantity.toString()),
                IconButton(tooltip: 'Adaugă', onPressed: () => setState(() => cart[item.id] = quantity + 1), icon: const Icon(Icons.add_circle_outline)),
              ]),
            ),
          );
        }),
        const SizedBox(height: 16),
        if (count > 0) FilledButton(
          onPressed: () {
            setState(() => cart.clear());
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Coș simulat. Nicio comandă nu a fost trimisă.')));
          },
          child: Text('Simulează coșul • ' + (total / 100).toStringAsFixed(2) + ' RON'),
        ),
      ]),
    );
  }
}
