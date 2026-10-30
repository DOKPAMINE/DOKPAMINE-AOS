package com.dokpamine.app.ui.timer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.TimerState
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.domain.EndPageInput
import com.dokpamine.app.domain.PageRules
import com.dokpamine.app.domain.formatClock
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.CardShape
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.SecondaryButton
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class TimerViewModel(val c: AppContainer) : ViewModel() {
    /** null = 아직 로딩 중, Pair(null, null) = 진행 중인 타이머 없음 */
    val state = c.timer.state
        .flatMapLatest { timer ->
            if (timer == null) flowOf(TimerUi(null, null))
            else c.records.observeBook(timer.bookId).map { TimerUi(timer, it) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val title get() = state.value?.book?.title.orEmpty()

    fun pause() = viewModelScope.launch { c.timer.pause(title) }
    fun resume() = viewModelScope.launch { c.timer.resume(title) }
    fun finish(onDone: () -> Unit) = viewModelScope.launch { c.timer.finish(title); onDone() }
    fun discard(onDone: () -> Unit) = viewModelScope.launch { c.timer.clear(); onDone() }
    fun saveDraft(text: String) = viewModelScope.launch { c.timer.saveDraft(text) }

    /** FR-02: 종료 후 저장. 같은 세션 ID 로 저장하므로 중복 탭에도 한 건만 남는다. */
    fun save(endPage: Int?, markDone: Boolean, onDone: () -> Unit) = viewModelScope.launch {
        val timer = c.timer.current() ?: return@launch onDone()
        c.records.saveTimerSession(timer, endPage, markDone)
        c.timer.clear()
        onDone()
    }
}

data class TimerUi(val timer: TimerState?, val book: BookEntity?)

/** T02 책에 집중하는 시간 / T03 잠깐 쉬어 갈 때 */
@Composable
fun TimerScreen(onBack: () -> Unit, onFinished: () -> Unit, onIdle: () -> Unit) {
    val vm = appViewModel { TimerViewModel(it) }
    val ui by vm.state.collectAsStateWithLifecycle()
    val timer = ui?.timer
    var confirmDiscard by remember { mutableStateOf(false) }

    LaunchedEffect(ui) {
        when {
            ui != null && timer == null -> onIdle()
            timer?.isFinished == true -> onFinished()
        }
    }
    if (timer == null || timer.isFinished) return

    // 화면 숫자는 저장된 시각으로부터 계산한다. 1초마다 다시 그리기만 한다.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(timer.isRunning) {
        while (timer.isRunning) {
            now = System.currentTimeMillis()
            delay(250)
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("이번 기록을 버릴까요?") },
            text = { Text("측정한 ${formatClock(timer.elapsedMs(now))}이 저장되지 않아요.") },
            confirmButton = { TextButton(onClick = { vm.discard(onBack) }) { Text("버리기", color = Dok.Error) } },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("계속 읽기") } },
        )
    }

    DokScreen(
        title = if (timer.isRunning) "책에 집중하는 시간" else "잠깐 쉬어 갈 때",
        onBack = onBack,
        subtitle = ui?.book?.title,
    ) {
        Surface(color = Dok.Ink, contentColor = Dok.Lime, shape = CardShape, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 28.dp)) {
                Text(if (timer.isRunning) "READING IN PROGRESS" else "PAUSED", style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(28.dp))
                Text(formatClock(timer.elapsedMs(now)), fontSize = 52.sp, color = androidx.compose.ui.graphics.Color.White)
                Spacer(Modifier.height(20.dp))
                Text(
                    "${timer.startPage}쪽부터 읽는 중 · ${if (timer.isRunning) "측정 중" else "일시정지 · 쉬는 시간은 더하지 않아요"}",
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (timer.isRunning) SecondaryButton("잠깐 쉬기", vm::pause, Modifier.weight(1f))
            else SecondaryButton("다시 읽기", vm::resume, Modifier.weight(1f))
            SecondaryButton("기록 버리기", { confirmDiscard = true }, Modifier.weight(1f))
        }
        PrimaryButton("오늘 독서 마치기", { vm.finish(onFinished) })
        Text(
            "다른 화면으로 나가도 타이머는 계속 돌아가요. 앱을 꺼도 다시 열면 이어져요.",
            style = MaterialTheme.typography.labelSmall,
            color = Dok.Muted,
        )
    }
}

/** T04 오늘 읽은 만큼 / T05 되돌아 읽었나요? / T08 한 권, 완독! (FR-03) */
@Composable
fun RecordPageScreen(onBack: () -> Unit, onSaved: () -> Unit) {
    val vm = appViewModel { TimerViewModel(it) }
    val ui by vm.state.collectAsStateWithLifecycle()
    val timer = ui?.timer
    val book = ui?.book

    var input by remember(timer?.sessionId) { mutableStateOf(timer?.endPageDraft.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmReread by remember { mutableStateOf<Int?>(null) }
    // 완독 저장 뒤에는 타이머가 비워지므로 축하 문구에 쓸 제목을 따로 들고 있는다.
    var celebrateTitle by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(ui) { if (ui != null && timer == null && celebrateTitle == null) onSaved() }
    celebrateTitle?.let { title ->
        AlertDialog(
            onDismissRequest = onSaved,
            title = { Text("한 권, 완독!") },
            text = { Text("「$title」을(를) 끝까지 읽었어요. 감상을 남기면 오래 기억할 수 있어요.") },
            confirmButton = { TextButton(onClick = onSaved) { Text("확인") } },
        )
    }
    if (timer == null || book == null) return

    val elapsedSeconds = timer.elapsedMs(timer.finishedAtMs ?: System.currentTimeMillis()) / 1000
    val parsed = PageRules.parseEndPage(input, timer.startPage, book.totalPages)
    val readNow = (parsed as? EndPageInput.Valid)?.endPage?.minus(timer.startPage) ?: 0

    fun submit(markDone: Boolean) {
        when (val p = if (markDone) EndPageInput.Valid(book.totalPages) else parsed) {
            is EndPageInput.Invalid -> error = p.message
            is EndPageInput.Reread -> confirmReread = p.endPage
            is EndPageInput.TimeOnly -> vm.save(null, false, onSaved)
            is EndPageInput.Valid -> {
                if (markDone) celebrateTitle = book.title
                vm.save(p.endPage, markDone) { if (!markDone) onSaved() }
            }
        }
    }

    confirmReread?.let { page ->
        AlertDialog(
            onDismissRequest = { confirmReread = null },
            title = { Text("앞부분을 다시 읽었나요?") },
            text = { Text("${timer.startPage}쪽보다 앞인 ${page}쪽이에요. 되돌아 읽기로 저장하면 시간만 통계에 더하고 쪽수는 세지 않아요.") },
            confirmButton = { TextButton(onClick = { confirmReread = null; vm.save(page, false, onSaved) }) { Text("되돌아 읽기로 저장") } },
            dismissButton = { TextButton(onClick = { confirmReread = null }) { Text("다시 입력") } },
        )
    }

    DokScreen(title = "오늘 읽은 만큼", onBack = onBack, subtitle = "${formatDuration(elapsedSeconds)} · 수고했어요!") {
        StatRow("${timer.startPage}쪽" to "시작 페이지", "${readNow}쪽" to "이번에 읽음")
        LabeledField(
            "마지막으로 읽은 쪽 (전체 ${book.totalPages}쪽)",
            input,
            {
                input = it.filter(Char::isDigit)
                error = null
                vm.saveDraft(input)
            },
            number = true,
            error = error,
            placeholder = "${timer.startPage}",
        )
        Text("페이지를 기억하지 못해도 괜찮아요", style = MaterialTheme.typography.titleSmall)
        Text(
            "빈칸으로 저장하면 시간만 기록해요.\n이전 페이지보다 작으면 되돌아 읽기인지 확인해요.",
            style = MaterialTheme.typography.bodySmall,
            color = Dok.Muted,
        )
        PrimaryButton("기록 저장", { submit(false) })
        OutlineButton("이 책을 다 읽었어요", { submit(true) })
    }
}
