import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';
import '../services/tts_service.dart';

class ConversationPage extends StatefulWidget {
  const ConversationPage({super.key});

  @override
  State<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends State<ConversationPage> {
  final SpeechToText _speech = SpeechToText();
  final TtsService _tts = TtsService(
    apiKey: const String.fromEnvironment('ELEVENLABS_API_KEY'),
  );
  String _transcript = '';
  String _status = 'Pulsa el micrófono para escuchar';
  bool _isListening = false;

  Future<void> _toggleListening() async {
    if (_isListening) {
      await _speech.stop();
      if (mounted) {
        setState(() {
          _isListening = false;
          _status = _transcript.isEmpty ? 'No se reconoció voz' : 'Mensaje listo';
        });
      }
      return;
    }

    final permission = await Permission.microphone.request();
    if (!permission.isGranted) {
      if (mounted) {
        setState(() => _status = 'Se necesita permiso para usar el micrófono');
      }
      return;
    }

    final available = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) return;
        if (status == 'done' || status == 'notListening') {
          setState(() {
            _isListening = false;
            _status = _transcript.isEmpty ? 'No se reconoció voz' : 'Mensaje listo';
          });
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() {
          _isListening = false;
          _status = 'No se pudo escuchar: ${error.errorMsg}';
        });
      },
    );

    if (!available) {
      if (mounted) {
        setState(() => _status = 'El reconocimiento de voz no está disponible');
      }
      return;
    }

    setState(() {
      _isListening = true;
      _status = 'Escuchando…';
    });
    await _speech.listen(
      onResult: _onSpeechResult,
      listenOptions: SpeechListenOptions(
        localeId: 'es_MX',
        partialResults: true,
        listenMode: ListenMode.dictation,
      ),
    );
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    if (!mounted) return;
    setState(() {
      _transcript = result.recognizedWords;
      if (result.finalResult) {
        _isListening = false;
        _status = _transcript.isEmpty ? 'No se reconoció voz' : 'Mensaje listo';
      }
    });
  }

  Future<void> _speakTranscript() async {
    if (_transcript.trim().isEmpty) return;
    await _tts.speak(_transcript);
  }

  @override
  void dispose() {
    _speech.stop();
    _tts.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/app-icon.png', width: 36, height: 36),
            const SizedBox(width: 8),
            const Text('Voz a texto'),
          ],
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Card(
                color: _isListening
                    ? colorScheme.errorContainer
                    : colorScheme.secondaryContainer,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  child: Row(
                    children: [
                      Icon(_isListening ? Icons.graphic_eq : Icons.hearing),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _status,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Center(
                    child: SingleChildScrollView(
                      child: Text(
                        _transcript.isEmpty
                            ? 'Aquí aparecerá lo que diga la persona oyente.'
                            : _transcript,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              height: 1.25,
                            ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _transcript.isEmpty
                          ? null
                          : () => setState(() {
                                _transcript = '';
                                _status = 'Pulsa el micrófono para escuchar';
                              }),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Borrar'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _transcript.isEmpty ? null : _speakTranscript,
                      icon: const Icon(Icons.volume_up_outlined),
                      label: const Text('Repetir'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 58,
                child: FilledButton.icon(
                  onPressed: _toggleListening,
                  icon: Icon(_isListening ? Icons.stop : Icons.mic),
                  label: Text(_isListening ? 'Detener' : 'Escuchar a la persona'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
