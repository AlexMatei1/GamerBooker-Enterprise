import 'package:flutter/material.dart';
import '../models/models.dart';

class CheckoutScreen extends StatefulWidget {
  final StationItem station;
  final int durationHours;
  final VoidCallback onBack;
  final VoidCallback onBookingSuccess;

  const CheckoutScreen({
    super.key,
    required this.station,
    required this.durationHours,
    required this.onBack,
    required this.onBookingSuccess,
  });

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  String _paymentMethod = 'GOOGLE_PAY'; // 'GOOGLE_PAY' | 'CARD' | 'COINS'
  final TextEditingController _promoController = TextEditingController();
  int _discountPercent = 0;
  String? _promoMessage;
  bool _agreedTerms = true;
  bool _isProcessing = false;

  void _applyPromo() {
    final code = _promoController.text.trim().toUpperCase();
    if (code == 'ENTERPRISE10') {
      setState(() {
        _discountPercent = 10;
        _promoMessage = '10% voucher discount applied!';
      });
    } else {
      setState(() {
        _discountPercent = 0;
        _promoMessage = 'Invalid code. Try ENTERPRISE10';
      });
    }
  }

  void _handlePay() {
    setState(() {
      _isProcessing = true;
    });

    Future.delayed(const Duration(milliseconds: 1400), () {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
        widget.onBookingSuccess();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final subtotalBani = widget.station.hourlyRate * widget.durationHours;
    final initialDepositBani = (subtotalBani * 0.30).round();
    final discountBani = (initialDepositBani * _discountPercent) ~/ 100;
    final finalDepositBani = initialDepositBani - discountBani;

    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: widget.onBack,
        ),
        title: const Text(
          'Review & Settle Deposit',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // Station Summary Box
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Assigned Station', style: TextStyle(color: Colors.white54, fontSize: 11)),
                        const SizedBox(height: 2),
                        Text(
                          widget.station.name,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.white),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('Duration', style: TextStyle(color: Colors.white54, fontSize: 11)),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.durationHours} Hours',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                        ),
                      ],
                    ),
                  ],
                ),
                const Divider(height: 24, color: Colors.white12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total Session Price', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    Text(
                      '${(subtotalBani / 100).toStringAsFixed(2)} RON',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Online Deposit (30%)', style: TextStyle(color: Color(0xFF34D399), fontSize: 13, fontWeight: FontWeight.w600)),
                    Text(
                      '${(finalDepositBani / 100).toStringAsFixed(2)} RON',
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF34D399), fontSize: 15),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Promo Code Box
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF12131A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Row(
              children: [
                const Icon(Icons.confirmation_number_outlined, color: Colors.white54, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _promoController,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontFamily: 'monospace'),
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      hintText: 'Voucher code (ENTERPRISE10)',
                      hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
                      border: InputBorder.none,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _applyPromo,
                  child: const Text('Apply', style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          if (_promoMessage != null)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 14),
              child: Text(
                _promoMessage!,
                style: TextStyle(
                  fontSize: 11,
                  color: _discountPercent > 0 ? const Color(0xFF34D399) : Colors.redAccent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          const SizedBox(height: 20),

          // Payment Methods
          const Text(
            'Payment Method',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _buildPaymentTab('GOOGLE_PAY', 'Google Pay', Icons.payment),
              const SizedBox(width: 8),
              _buildPaymentTab('CARD', 'Credit Card', Icons.credit_card),
              const SizedBox(width: 8),
              _buildPaymentTab('COINS', 'Arena Coins', Icons.account_balance_wallet_outlined),
            ],
          ),

          const SizedBox(height: 16),

          // Card Details Box if selected
          if (_paymentMethod == 'CARD')
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF12131A),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Cardholder Name', style: TextStyle(fontSize: 11, color: Colors.white54)),
                  SizedBox(height: 4),
                  Text('ALEX M.', style: TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.bold)),
                  Divider(height: 20, color: Colors.white12),
                  Text('Card Number', style: TextStyle(fontSize: 11, color: Colors.white54)),
                  SizedBox(height: 4),
                  Text('4242 •••• •••• 4242', style: TextStyle(fontSize: 13, color: Colors.white, fontFamily: 'monospace')),
                ],
              ),
            ),

          const SizedBox(height: 16),

          // Law 42/2024 Checkbox
          CheckboxListTile(
            value: _agreedTerms,
            onChanged: (val) => setState(() => _agreedTerms = val ?? true),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            activeColor: const Color(0xFF10B981),
            title: const Text(
              'Declar pe propria răspundere că am minim 16 ani (conform Legii 42/2024 pentru orele de noapte) și accept termenii de anulare OG 34/2014.',
              style: TextStyle(fontSize: 11, color: Colors.white70),
            ),
          ),

          const SizedBox(height: 24),

          // Settle Button
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: (!_agreedTerms || _isProcessing) ? null : _handlePay,
            child: _isProcessing
                ? const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black)),
                      SizedBox(width: 12),
                      Text('Authorizing Deposit...', style: TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  )
                : Text(
                    'Pay ${(finalDepositBani / 100).toStringAsFixed(2)} RON & Lock Station',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildPaymentTab(String id, String label, IconData icon) {
    final isSelected = _paymentMethod == id;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _paymentMethod = id),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF1E202C) : const Color(0xFF12131A),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isSelected ? const Color(0xFF10B981) : Colors.white.withOpacity(0.08),
            ),
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: isSelected ? const Color(0xFF34D399) : Colors.white54),
              const SizedBox(height: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? Colors.white : Colors.white54,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
