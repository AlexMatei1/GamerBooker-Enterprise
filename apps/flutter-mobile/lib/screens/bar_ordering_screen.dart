import 'package:flutter/material.dart';
import '../models/models.dart';
import '../data/mock_data.dart';

class BarOrderingScreen extends StatefulWidget {
  final Function(BarOrder) onOrderPlaced;

  const BarOrderingScreen({super.key, required this.onOrderPlaced});

  @override
  State<BarOrderingScreen> createState() => _BarOrderingScreenState();
}

class _BarOrderingScreenState extends State<BarOrderingScreen> {
  String _selectedCategory = 'ALL';
  final Map<String, int> _cart = {}; // menuItemId -> quantity

  void _increment(String id) {
    setState(() {
      _cart[id] = (_cart[id] ?? 0) + 1;
    });
  }

  void _decrement(String id) {
    setState(() {
      if ((_cart[id] ?? 0) > 1) {
        _cart[id] = _cart[id]! - 1;
      } else {
        _cart.remove(id);
      }
    });
  }

  int get _totalBani {
    int total = 0;
    _cart.forEach((id, qty) {
      final item = mockMenuItems.firstWhere((i) => i.id == id);
      total += item.price * qty;
    });
    return total;
  }

  int get _totalItems {
    int count = 0;
    _cart.forEach((_, qty) => count += qty);
    return count;
  }

  void _checkoutOrder() {
    if (_cart.isEmpty) return;

    final orderItems = _cart.entries.map((e) {
      final item = mockMenuItems.firstWhere((i) => i.id == e.key);
      return OrderItem(item: item, quantity: e.value);
    }).toList();

    final order = BarOrder(
      id: 'ORD-${DateTime.now().millisecondsSinceEpoch.toString().substring(8)}',
      bookingId: 'BK-NX-8492',
      stationName: 'VIP-01',
      items: orderItems,
      totalAmount: _totalBani,
      crockfordCode: '9H3P',
      status: 'PLACED',
      placedAt: 'Just now',
    );

    widget.onOrderPlaced(order);
    setState(() {
      _cart.clear();
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF064E3B),
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Color(0xFF34D399), size: 20),
            const SizedBox(width: 8),
            Text(
              '✓ Comandă trimisă la Bar! Cod ridicare: ${order.crockfordCode}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
            ),
          ],
        ),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredItems = _selectedCategory == 'ALL'
        ? mockMenuItems
        : mockMenuItems.where((i) => i.category == _selectedCategory).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'NEXUS ARENA BAR',
              style: TextStyle(fontSize: 10, letterSpacing: 1.5, color: Color(0xFF10B981), fontWeight: FontWeight.bold),
            ),
            Text(
              'Snacks & Drinks',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.only(left: 16, right: 16, top: 12, bottom: 100),
            children: [
              // Category Switcher
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildCategoryPill('ALL', 'All Items'),
                    _buildCategoryPill('ENERGY', 'Energy Drinks'),
                    _buildCategoryPill('DRINK', 'Cold Sodas'),
                    _buildCategoryPill('SNACK', 'Chips & Sweets'),
                    _buildCategoryPill('HOT_FOOD', 'Burgers & Warm'),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // Menu Items List
              ...filteredItems.map((item) {
                final qty = _cart[item.id] ?? 0;
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF12131A),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Colors.white.withOpacity(0.06)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Center(
                          child: Text(item.imageIcon, style: const TextStyle(fontSize: 24)),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.name,
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                            ),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Text(
                                  '${(item.price / 100).toStringAsFixed(2)} RON',
                                  style: const TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                                if (item.requiresAgeVerification) ...[
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.amber.withOpacity(0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      '16+ / 18+',
                                      style: TextStyle(color: Colors.amber, fontSize: 9, fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                      // Add / Quantity controls
                      if (qty == 0)
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1E202C),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          ),
                          onPressed: () => _increment(item.id),
                          child: const Text('Add', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        )
                      else
                        Row(
                          children: [
                            IconButton(
                              icon: const Icon(Icons.remove_circle_outline, color: Colors.white70, size: 22),
                              onPressed: () => _decrement(item.id),
                            ),
                            Text(
                              '$qty',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                            ),
                            IconButton(
                              icon: const Icon(Icons.add_circle, color: Color(0xFF10B981), size: 22),
                              onPressed: () => _increment(item.id),
                            ),
                          ],
                        ),
                    ],
                  ),
                );
              }).toList(),
            ],
          ),

          // Floating Cart Bottom Tray
          if (_totalItems > 0)
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.8),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '$_totalItems Items in Cart',
                          style: const TextStyle(color: Colors.black54, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          '${(_totalBani / 100).toStringAsFixed(2)} RON',
                          style: const TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.black,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      ),
                      onPressed: _checkoutOrder,
                      child: const Text(
                        'Order Now →',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCategoryPill(String id, String label) {
    final isSelected = _selectedCategory == id;
    return GestureDetector(
      onTap: () => setState(() => _selectedCategory = id),
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : const Color(0xFF12131A),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? Colors.white : Colors.white.withOpacity(0.08),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.black : Colors.white70,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
