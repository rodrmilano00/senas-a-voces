package com.senasavoces.senas_a_voces

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import io.flutter.view.TextureRegistry
import java.util.concurrent.Executors

/**
 * Puente nativo: CameraX abre la camara y renderiza el preview en una textura
 * de Flutter. Cada frame se pasa a MediaPipe HandLandmarker + FaceLandmarker
 * (LIVE_STREAM) y los landmarks se emiten por EventChannel hacia Dart.
 *
 * Requiere los modelos en android/app/src/main/assets/:
 *   - hand_landmarker.task
 *   - face_landmarker.task
 */
class VisionPlugin(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val textureRegistry: TextureRegistry,
    messenger: io.flutter.plugin.common.BinaryMessenger,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {

    private val methodChannel = MethodChannel(messenger, "senasavoces/vision")
    private val eventChannel = EventChannel(messenger, "senasavoces/vision_stream")
    private var sink: EventChannel.EventSink? = null

    private var textureEntry: TextureRegistry.SurfaceTextureEntry? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var lensFront = true

    private var handLandmarker: HandLandmarker? = null
    private var faceLandmarker: FaceLandmarker? = null

    // Executor dedicado a la inferencia (pesado) y otro para el preview,
    // para que el render de la camara no espere a MediaPipe.
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private val previewExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    @Volatile private var lastHands: HandLandmarkerResult? = null
    @Volatile private var lastFace: FaceLandmarkerResult? = null

    @Volatile private var faceVersion = 0L
    private var lastSentFaceVersion = -1L

    @Volatile var lastImgW = 1
    @Volatile var lastImgH = 1

    companion object {
        private const val TAG = "VisionPlugin"

        // Resolucion de analisis minima para maxima fluidez.
        private val ANALYSIS_SIZE = android.util.Size(256, 192)
    }

    init {
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
    }

    fun dispose() {
        stopCamera()
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
    }

    override fun onMethodCall(
        call: io.flutter.plugin.common.MethodCall,
        result: MethodChannel.Result
    ) {
        when (call.method) {
            "start" -> {
                lensFront = (call.argument<String>("lens") ?: "front") == "front"
                setupDetectors()
                startCamera { id ->
                    mainHandler.post { result.success(id) }
                }
            }
            "stop" -> {
                stopCamera()
                result.success(null)
            }
            "switchCamera" -> {
                lensFront = !lensFront
                startCamera { id ->
                    mainHandler.post { result.success(id) }
                }
            }
            "getTextureId" -> result.success(textureEntry?.id())
            else -> result.notImplemented()
        }
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        sink = events
    }

    override fun onCancel(arguments: Any?) {
        sink = null
    }

    private fun setupDetectors() {
        if (handLandmarker == null) {
            handLandmarker = createHandLandmarker(Delegate.CPU)
        }
        // FaceLandmarker desactivado: consume mucha CPU y causa lag.
        // Se puede reactivar cuando se necesite deteccion de expresiones.
        // faceLandmarker = createFaceLandmarker(Delegate.CPU)
    }

    private fun createHandLandmarker(delegate: Delegate): HandLandmarker? {
        return try {
            val base = BaseOptions.builder()
                .setModelAssetPath("hand_landmarker.task")
                .setDelegate(delegate)
                .build()
            val options = HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(base)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumHands(1)
                .setMinHandDetectionConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setMinHandPresenceConfidence(0.5f)
                .setResultListener { r, _ -> lastHands = r; emit() }
                .setErrorListener { e -> Log.e(TAG, "HandLandmarker error: ${e.message}", e) }
                .build()
            HandLandmarker.createFromOptions(context, options)
        } catch (e: Exception) {
            Log.e(TAG, "createHandLandmarker($delegate) failed: ${e.message}", e)
            null
        }
    }

    private fun createFaceLandmarker(delegate: Delegate): FaceLandmarker? {
        return try {
            val base = BaseOptions.builder()
                .setModelAssetPath("face_landmarker.task")
                .setDelegate(delegate)
                .build()
            val options = FaceLandmarker.FaceLandmarkerOptions.builder()
                .setBaseOptions(base)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setNumFaces(1)
                .setOutputFaceBlendshapes(true)
                .setResultListener { r, _ -> lastFace = r; faceVersion++ }
                .setErrorListener { e -> Log.e(TAG, "FaceLandmarker error: ${e.message}", e) }
                .build()
            FaceLandmarker.createFromOptions(context, options)
        } catch (e: Exception) {
            Log.e(TAG, "createFaceLandmarker($delegate) failed: ${e.message}", e)
            null
        }
    }

    private fun startCamera(onReady: (Long?) -> Unit) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            cameraProvider = future.get()
            val id = bindUseCases()
            onReady(id)
        }, ContextCompat.getMainExecutor(context))
    }

    private fun stopCamera() {
        cameraProvider?.unbindAll()
        textureEntry?.release()
        textureEntry = null
    }

    private fun bindUseCases(): Long? {
        val provider = cameraProvider ?: return null
        provider.unbindAll()

        if (textureEntry == null) {
            textureEntry = textureRegistry.createSurfaceTexture()
        }
        val surfaceTexture = textureEntry!!.surfaceTexture()

        val preview = Preview.Builder()
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            android.util.Size(640, 480),
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
                        )
                    )
                    .build()
            )
            .build()
        preview.setSurfaceProvider { request ->
            val res = request.resolution
            surfaceTexture.setDefaultBufferSize(res.width, res.height)
            val surface = android.view.Surface(surfaceTexture)
            request.provideSurface(surface, previewExecutor) { surface.release() }
        }

        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            ANALYSIS_SIZE,
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
                        )
                    )
                    .build()
            )
            .build()
        analysis.setAnalyzer(analysisExecutor) { proxy -> analyze(proxy) }

        val selector = if (lensFront) CameraSelector.DEFAULT_FRONT_CAMERA
        else CameraSelector.DEFAULT_BACK_CAMERA

        provider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
        return textureEntry?.id()
    }

    private fun analyze(proxy: ImageProxy) {
        try {
            val bitmap = proxy.toBitmap()
            val rotation = proxy.imageInfo.rotationDegrees
            val mpImage = BitmapImageBuilder(bitmap).build()
            val processingOptions = ImageProcessingOptions.builder()
                .setRotationDegrees(rotation)
                .build()
            val ts = System.currentTimeMillis()
            // Solo manos: face landmarker desactivado por rendimiento.
            handLandmarker?.detectAsync(mpImage, processingOptions, ts)

            // Guardar dimensiones rotadas para que Flutter pueda calcular
            // el mapeo correcto del overlay sobre el Texture.
            val bw = bitmap.width
            val bh = bitmap.height
            if (rotation == 90 || rotation == 270) {
                lastImgW = bh
                lastImgH = bw
            } else {
                lastImgW = bw
                lastImgH = bh
            }
        } catch (e: Exception) {
            Log.e(TAG, "analyze() failed: ${e.message}", e)
        } finally {
            proxy.close()
        }
    }

    private fun emit() {
        val hands = lastHands

        // Cada mano se envia como un DoubleArray plano [x0,y0,z0, x1,y1,z1, ...]
        // en vez de 21 HashMaps: mucho mas rapido de serializar por el
        // canal de plataforma.
        val handsList = ArrayList<DoubleArray>()
        if (hands != null) {
            for (hand in hands.landmarks()) {
                val flat = DoubleArray(hand.size * 3)
                var i = 0
                for (lm in hand) {
                    flat[i++] = lm.x().toDouble()
                    flat[i++] = lm.y().toDouble()
                    flat[i++] = lm.z().toDouble()
                }
                handsList.add(flat)
            }
        }

        // Los landmarks de cara (478) no se usan en Dart: solo blendshapes.
        // Se envian unicamente cuando hay un resultado facial nuevo.
        var blend: HashMap<String, Any>? = null
        val version = faceVersion
        if (version != lastSentFaceVersion) {
            lastSentFaceVersion = version
            val face = lastFace
            if (face != null &&
                face.faceBlendshapes().isPresent &&
                face.faceBlendshapes().get().isNotEmpty()
            ) {
                val m = HashMap<String, Any>()
                for (c in face.faceBlendshapes().get()[0]) {
                    m[c.categoryName()] = c.score()
                }
                blend = m
            }
        }

        val payload = HashMap<String, Any>()
        payload["hands"] = handsList
        payload["mirror"] = lensFront
        payload["imgW"] = lastImgW
        payload["imgH"] = lastImgH
        if (blend != null) payload["blendshapes"] = blend

        // EventSink debe llamarse desde el hilo principal (no es thread-safe).
        mainHandler.post { sink?.success(payload) }
    }
}
