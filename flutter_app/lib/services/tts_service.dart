import 'dart:convert';
import 'dart:io';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TtsService {
  final AudioPlayer _player = AudioPlayer();
  final FlutterTts _nativeTts = FlutterTts();
  final String apiKey;

  TtsService({this.apiKey = ''});

  /// Speaks the given text. Caches MP3 by text hash.
  Future<void> speak(String text) async {
    if (text.trim().isEmpty) return;
    if (apiKey.trim().isEmpty) {
      await _nativeTts.setLanguage('es-MX');
      await _nativeTts.setSpeechRate(0.45);
      await _nativeTts.setVolume(1.0);
      await _nativeTts.speak(text);
      return;
    }

    final cacheDir = await getTemporaryDirectory();
    final safeHash = base64Encode(utf8.encode(text)).replaceAll('/', '_');
    final filePath = '${cacheDir.path}/tts_$safeHash.mp3';
    final file = File(filePath);

    if (await file.exists()) {
      await _playFile(filePath);
      return;
    }

    final voiceId = await _getVoiceId();
    final uri = Uri.parse('https://api.elevenlabs.io/v1/text-to-speech/$voiceId');

    final response = await http.post(
      uri,
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'text': text,
        'model_id': 'eleven_multilingual_v2',
        'voice_settings': {
          'stability': 0.5,
          'similarity_boost': 0.75,
        },
      }),
    );

    if (response.statusCode == 200) {
      await file.writeAsBytes(response.bodyBytes);
      await _playFile(filePath);
    } else {
      throw Exception('TTS request failed: ${response.statusCode} ${response.body}');
    }
  }

  Future<void> _playFile(String path) async {
    await _player.setFilePath(path);
    await _player.play();
  }

  Future<String> _getVoiceId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('elevenlabs_voice_id') ?? '21m00Tcm4TlvDq8ikWAM';
  }

  Future<void> setVoiceId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('elevenlabs_voice_id', id);
  }

  void dispose() {
    _player.dispose();
    _nativeTts.stop();
  }
}
