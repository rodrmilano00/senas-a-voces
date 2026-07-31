package com.senasavoces.senas_a_voces

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var visionPlugin: VisionPlugin? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        visionPlugin = VisionPlugin(
            context = applicationContext,
            lifecycleOwner = this,
            textureRegistry = flutterEngine.renderer,
            messenger = flutterEngine.dartExecutor.binaryMessenger,
        )
    }

    override fun onDestroy() {
        visionPlugin?.dispose()
        visionPlugin = null
        super.onDestroy()
    }
}
