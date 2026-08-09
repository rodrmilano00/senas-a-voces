import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'theme/brand.dart';
import 'ui/live_translation_page.dart';
import 'ui/ai_live_translation_page.dart';

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
      home: const ModeSelectorPage(),
    );
  }
}

/// Pantalla inicial para elegir modo de detección: DTW o AI (OpenAI).
class ModeSelectorPage extends StatelessWidget {
  const ModeSelectorPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset('assets/images/logo-senas-a-voces.png',
                  height: 80, errorBuilder: (_, __, ___) => const SizedBox()),
              const SizedBox(height: 24),
              const Text(
                'Señas a Voces',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: Brand.fg,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Traductor de Lengua de Señas Mexicana',
                style: TextStyle(fontSize: 14, color: Brand.muted),
              ),
              const SizedBox(height: 48),
              const Text(
                'Selecciona el modo de detección',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Brand.muted,
                ),
              ),
              const SizedBox(height: 24),
              _modeCard(
                context,
                icon: Icons.speed,
                title: 'DTW (Local)',
                desc: 'Comparación local con DTW. Rápido, sin internet.',
                color: Brand.accent,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LiveTranslationPage()),
                ),
              ),
              const SizedBox(height: 16),
              _modeCard(
                context,
                icon: Icons.psychology,
                title: 'AI (OpenAI)',
                desc: 'Clasificación con GPT-4o-mini. Usa landmarks + JSON de entrenamiento.',
                color: Brand.primary,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const AiLiveTranslationPage()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _modeCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String desc,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Brand.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Brand.border),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: color,
                      )),
                  const SizedBox(height: 4),
                  Text(desc,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Brand.muted,
                      )),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios, color: color.withOpacity(0.5), size: 16),
          ],
        ),
      ),
    );
  }
}
