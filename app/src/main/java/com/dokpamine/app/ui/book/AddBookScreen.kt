package com.dokpamine.app.ui.book

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.SecondaryButton
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.theme.Dok
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import kotlinx.coroutines.delay

/** A01 · 책 등록 */
@Composable
fun AddBookScreen(onBack: () -> Unit, onScan: () -> Unit, onManual: () -> Unit, onIsbn: (String) -> Unit) {
    var isbn by remember { mutableStateOf("") }
    var isbnError by remember { mutableStateOf<String?>(null) }
    DokScreen(title = "책 등록", onBack = onBack, subtitle = "책 뒷면의 ISBN 바코드를 찍으면 제목과 저자를 채워 드려요.") {
        DokCard {
            Text("바코드로 등록", style = MaterialTheme.typography.titleSmall)
            Text("카메라로 ISBN 바코드를 비춰 주세요. 처음 한 번 카메라 권한을 물어요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
        }
        PrimaryButton("바코드 스캔하기", onScan)
        OutlineButton("직접 입력하기", onManual)
        // 바코드가 훼손됐거나 카메라가 없는 기기(에뮬레이터 포함)를 위한 ISBN 번호 조회
        LabeledField("ISBN 번호로 찾기", isbn, { isbn = it.filter(Char::isDigit); isbnError = null }, number = true, error = isbnError, placeholder = "978로 시작하는 13자리")
        SecondaryButton("ISBN 으로 찾기", {
            if (isbn.length == 13) onIsbn(isbn) else isbnError = "13자리 숫자를 입력해 주세요."
        }, Modifier.fillMaxWidth())
    }
}

/**
 * A03 바코드 스캔 / A04 카메라 권한 거절.
 * - 카메라 권한은 이 화면에 처음 들어올 때만 요청하고, 거절하면 직접 입력으로 안내한다(NFR-07).
 * - 5초 동안 인식하지 못하면 재촬영·직접 입력 선택지를 보여준다(UC-01 3a).
 */
@Composable
fun ScanScreen(onBack: () -> Unit, onScanned: (String) -> Unit, onManual: (String?) -> Unit) {
    val context = LocalContext.current
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        denied = !ok
    }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    DokScreen(title = if (denied) "카메라를 쓸 수 없어요" else "바코드 스캔", onBack = onBack) {
        when {
            granted -> BarcodeScanner(onScanned = onScanned, onManual = { onManual(null) })
            denied -> {
                Text(
                    "카메라 권한이 없어도 괜찮아요. 제목과 저자를 직접 입력해서 등록할 수 있어요.\n설정 > 앱 > 독파민에서 카메라 권한을 켜면 바코드로도 등록할 수 있어요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Dok.Muted,
                )
                PrimaryButton("직접 입력하기", { onManual(null) })
            }
        }
    }
}

@Composable
private fun BarcodeScanner(onScanned: (String) -> Unit, onManual: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var attempt by remember { mutableStateOf(0) }
    var timedOut by remember { mutableStateOf(false) }
    var delivered by remember { mutableStateOf(false) }

    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
            imageAnalysisResolutionSelector = ResolutionSelector.Builder()
                .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                .build()
            imageAnalysisBackpressureStrategy = ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
        }
    }
    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_EAN_13).build())
    }

    DisposableEffect(Unit) {
        val executor = ContextCompat.getMainExecutor(context)
        controller.setImageAnalysisAnalyzer(
            executor,
            MlKitAnalyzer(listOf(scanner), ImageAnalysis.COORDINATE_SYSTEM_ORIGINAL, executor) { result ->
                val isbn = result.getValue(scanner)
                    ?.mapNotNull { it.rawValue }
                    ?.firstOrNull { it.length == 13 && (it.startsWith("978") || it.startsWith("979")) }
                if (isbn != null && !delivered) {
                    delivered = true
                    onScanned(isbn)
                }
            },
        )
        controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            controller.unbind()
            scanner.close()
        }
    }

    LaunchedEffect(attempt) {
        timedOut = false
        delay(5_000)
        if (!delivered) timedOut = true
    }

    Box(
        Modifier.fillMaxWidth().aspectRatio(3f / 4f).clip(RoundedCornerShape(18.dp)),
        contentAlignment = Alignment.Center,
    ) {
        AndroidView(
            factory = { ctx -> PreviewView(ctx).apply { this.controller = controller } },
            modifier = Modifier.fillMaxSize(),
        )
        // 바코드 가이드 영역
        Box(Modifier.fillMaxWidth(0.8f).height(120.dp).border(3.dp, Dok.Lime, RoundedCornerShape(12.dp)))
    }
    Text("가이드 안에 책 뒷면의 바코드를 맞춰 주세요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
    if (timedOut) {
        DokCard {
            Text("바코드를 찾지 못했어요", style = MaterialTheme.typography.titleSmall)
            Text("빛 반사가 없는 곳에서 다시 찍거나, 직접 입력해 주세요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
        }
        PrimaryButton("다시 찍기", { attempt++ })
    }
    OutlineButton("직접 입력하기", onManual)
}
