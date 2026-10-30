package com.dokpamine.app.ui.timer

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.dokpamine.app.DokpamineApp
import com.dokpamine.app.data.local.BookEntity
import kotlinx.coroutines.launch

/**
 * "독서 시작" 공통 동작.
 * - 알림 권한은 처음 독서를 시작할 때 한 번만 요청하고, 거절해도 타이머는 시작한다(NFR-08).
 * - 다른 책의 타이머가 진행 중이면 새로 시작하지 않고 기존 타이머로 안내한다(UC-02 2a).
 */
@Composable
fun rememberStartReading(onOpenTimer: () -> Unit): (BookEntity) -> Unit {
    val container = (LocalContext.current.applicationContext as DokpamineApp).container
    val scope = rememberCoroutineScope()
    var pendingBook by remember { mutableStateOf<BookEntity?>(null) }
    var conflictTitle by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        pendingBook?.let { book -> scope.launch { container.timer.start(book); onOpenTimer() } }
        pendingBook = null
    }

    conflictTitle?.let { title ->
        AlertDialog(
            onDismissRequest = { conflictTitle = null },
            title = { Text("이미 읽고 있는 책이 있어요") },
            text = { Text("「$title」 타이머가 진행 중이에요. 먼저 그 기록을 마쳐 주세요.") },
            confirmButton = { TextButton(onClick = { conflictTitle = null; onOpenTimer() }) { Text("진행 중인 타이머로") } },
            dismissButton = { TextButton(onClick = { conflictTitle = null }) { Text("닫기") } },
        )
    }

    return { book ->
        scope.launch {
            val current = container.timer.current()
            when {
                current != null && current.bookId == book.id -> onOpenTimer()
                current != null -> conflictTitle = container.records.getBook(current.bookId)?.title ?: "다른 책"
                Build.VERSION.SDK_INT >= 33 && container.preferences.consumeNotificationAsk() -> {
                    pendingBook = book
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                else -> {
                    container.timer.start(book)
                    onOpenTimer()
                }
            }
        }
    }
}
