import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/brand.dart';
import 'ui/live_translation_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: SenasAVocesApp()));
}

class SenasAVocesApp extends StatelessWidget {
  const SenasAVocesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Señas a Voces',
      debugShowCheckedModeBanner: false,
      theme: Brand.theme(),
      home: const LiveTranslationPage(),
    );
  }
}
