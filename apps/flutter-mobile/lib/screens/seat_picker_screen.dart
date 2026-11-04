import 'package:flutter/material.dart';
import '../models/models.dart';
import '../data/mock_data.dart';

class SeatPickerScreen extends StatefulWidget {
  final MobileVenue venue;
  final Function(StationItem station, int durationHours) onProceedToCheckout;
  final VoidCallback onBack;

  const SeatPickerScreen({
    super.key,
    required this.venue,
    required this.onProceedToCheckout,
    required this.onBack,
  });

  @override
  State<SeatPickerScreen> createState() => _SeatPickerScreenState();
}

class _SeatPickerScreenState extends State<SeatPickerScreen> {
  StationItem _selectedStation = mockStations[0];
  int _selectedDuration = 2; // hours

  final List<int> _durationOptions = [1, 2, 3, 4, 8];

  @override
  Widget build(BuildContext context) {
    final subtotalBani = _selectedStation.hourlyRate * _selectedDuration;
    final depositBani = (subtotalBani * 0.30).round();
    final remainderBani = subtotalBani - depositBani;

    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: widget.onBack,
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.venue.name,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const Text(
              'Select Station & Hours',
              style: TextStyle(fontSize: 11, color: Colors.white54),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          const Text(
            'Choose Gaming Workstation',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 12),

          // Station Cards Horizontal/Vertical List
          ...mockStations.map((station) {
            final isSelected = station.id == _selectedStation.id;
            final isOccupied = station.status == 'OCCUPIED';

            return GestureDetector(
              onTap: isOccupied
                  ? null
                  : () {
                      setState(() {
                        _selectedStation = station;
                      });
                    },
              child: Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFF1E202C) : const Color(0xFF12131A),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isSelected
                        ? const Color(0xFF10B981)
                        : isOccupied
                            ? Colors.white.withOpacity(0.04)
                            : Colors.white.withOpacity(0.08),
                    width: isSelected ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: isSelected ? const Color(0xFF10B981).withOpacity(0.2) : Colors.black,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.computer,
                        color: isSelected ? const Color(0xFF34D399) : Colors.white54,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                station.name,
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                              Text(
                                '${(station.hourlyRate / 100).toStringAsFixed(0)} RON/h',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: isSelected ? const Color(0xFF34D399) : Colors.white70,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            station.gpu,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF818CF8), fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            station.hardware,
                            style: const TextStyle(fontSize: 11, color: Colors.white38),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            station.peripherals,
                            style: const TextStyle(fontSize: 10, color: Colors.white24),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),

          const SizedBox(height: 16),
          const Text(
            'Session Duration',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 12),

          // Duration Pills
          Row(
            children: _durationOptions.map((h) {
              final isSelected = h == _selectedDuration;
              return Expanded(
                child: GestureDetector(
                  onTap: () {
                    setState(() {
                      _selectedDuration = h;
                    });
                  },
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected ? Colors.white : const Color(0xFF12131A),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isSelected ? Colors.white : Colors.white.withOpacity(0.08),
                      ),
                    ),
                    child: Center(
                      child: Text(
                        h == 8 ? 'All-Night' : '${h}h',
                        style: TextStyle(
                          color: isSelected ? Colors.black : Colors.white70,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 24),

          // Price Summary Box
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF12131A),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total Session Cost', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    Text(
                      '${(subtotalBani / 100).toStringAsFixed(2)} RON',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Online Deposit Due Now (30%)', style: TextStyle(color: Color(0xFF34D399), fontSize: 13, fontWeight: FontWeight.w600)),
                    Text(
                      '${(depositBani / 100).toStringAsFixed(2)} RON',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF34D399), fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Remaining at Reception (70%)', style: TextStyle(color: Colors.white38, fontSize: 11)),
                    Text(
                      '${(remainderBani / 100).toStringAsFixed(2)} RON',
                      style: const TextStyle(color: Colors.white38, fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Checkout Button
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: () => widget.onProceedToCheckout(_selectedStation, _selectedDuration),
            child: const Text(
              'Continue to Payment →',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
            ),
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }
}
