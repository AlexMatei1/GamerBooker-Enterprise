import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Cont')),
    body: ListView(padding: const EdgeInsets.all(16), children: [
      Card(color: const Color(0xFF12131A), child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
          CircleAvatar(radius: 28, child: Icon(Icons.person_outline)),
          SizedBox(height: 16),
          Text('Contul meu', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          SizedBox(height: 8),
          Text('Autentificarea și setările contului vor fi disponibile într-o versiune conectată.', style: TextStyle(color: Colors.white70, height: 1.4)),
        ]),
      )),
    ]),
  );
}
