package com.dokpamine.app.ui.timer

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.data.RecordRepository
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.domain.ManualSessionRules
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class ManualSessionViewModel(
    private val records: RecordRepository,
    private val bookId: String,
    private val sessionId: String,
    val editing: Boolean,
) : ViewModel() {
    var book by mutableStateOf<BookEntity?>(null)
        private set
    var loaded by mutableStateOf(false)
        private set
    var saving by mutableStateOf(false)
        private set
    var saved by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var date by mutableStateOf("")
    var time by mutableStateOf("")
    var minutes by mutableStateOf("")
    var startPage by mutableStateOf("")
    var endPage by mutableStateOf("")

    init {
        viewModelScope.launch {
            try {
                val b = records.getBook(bookId) ?: throw IllegalArgumentException("책을 찾을 수 없어요.")
                val session = if (editing) records.getSession(sessionId)
                    ?.takeIf { it.bookId == bookId }
                    ?: throw IllegalArgumentException("수정할 기록을 찾을 수 없어요.") else null
                val local = Instant.ofEpochMilli(session?.startedAt ?: (System.currentTimeMillis() - 60_000))
                    .atZone(ZoneId.systemDefault())
                date = local.toLocalDate().toString()
                time = local.format(DateTimeFormatter.ofPattern("HH:mm"))
                minutes = session?.let { ((it.activeSeconds.toLong() + 59) / 60).coerceAtLeast(1).toString() } ?: "1"
                startPage = (session?.startPage ?: b.currentPage).toString()
                endPage = session?.endPage?.toString().orEmpty()
                book = b
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = (e as? IllegalArgumentException)?.message ?: "기록을 불러오지 못했어요."
            } finally {
                loaded = true
            }
        }
    }

    fun clearError() { error = null }

    fun save() {
        if (book == null || saving || saved) return
        val startedAt = ManualSessionRules.parseStartedAt(date, time)
        if (startedAt == null) {
            error = "날짜(1900년 이후, YYYY-MM-DD)와 시작 시각(HH:mm)을 올바르게 입력해 주세요."
            return
        }
        // 재탭을 막고, 재시도도 라우트가 보관한 동일한 클라이언트 UUID를 사용한다.
        saving = true
        error = null
        viewModelScope.launch {
            try {
                records.saveManualSession(sessionId, bookId, startedAt, minutes, startPage, endPage)
                saved = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = (e as? IllegalArgumentException)?.message ?: "기록을 저장하지 못했어요. 다시 시도해 주세요."
            } finally {
                saving = false
            }
        }
    }
}

/** T09 수동 세션 추가·수정. 시간과 페이지를 직접 바꾼 기록은 모두 MANUAL이다. */
@Composable
fun ManualSessionScreen(bookId: String, sessionId: String, editing: Boolean, onBack: () -> Unit) {
    val vm = appViewModel(key = "manual-$sessionId") { ManualSessionViewModel(it.records, bookId, sessionId, editing) }
    LaunchedEffect(vm.saved) { if (vm.saved) onBack() }
    DokScreen(title = if (editing) "독서 기록 수정" else "기록 직접 추가", onBack = onBack, subtitle = vm.book?.title) {
        val b = vm.book
        if (b == null) {
            Text(vm.error ?: if (vm.loaded) "책을 찾을 수 없어요." else "기록을 불러오는 중이에요…", color = Dok.Muted)
        } else {
            Text("직접 입력한 기록은 개인 통계에 포함되며 랭킹에서는 제외돼요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
            if (editing) Text("타이머로 측정한 기록도 수정하면 직접 입력으로 바뀌어요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
            LabeledField("독서 날짜 (YYYY-MM-DD)", vm.date, { vm.date = it; vm.clearError() }, placeholder = "2026-10-30", enabled = !vm.saving)
            LabeledField("시작 시각 (24시간제 HH:mm)", vm.time, { vm.time = it; vm.clearError() }, placeholder = "14:30", enabled = !vm.saving)
            LabeledField("독서 시간 (분)", vm.minutes, { vm.minutes = it; vm.clearError() }, number = true, enabled = !vm.saving)
            LabeledField("시작 페이지 (전체 ${b.totalPages}쪽)", vm.startPage, { vm.startPage = it; vm.clearError() }, number = true, enabled = !vm.saving)
            LabeledField("종료 페이지 (선택)", vm.endPage, { vm.endPage = it; vm.clearError() }, number = true, enabled = !vm.saving)
            Text("종료 페이지를 비우면 시간만 저장해요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
            vm.error?.let { Text(it, color = Dok.Error, style = MaterialTheme.typography.bodySmall) }
            PrimaryButton(if (editing) "수정 저장" else "기록 저장", vm::save, loading = vm.saving, enabled = !vm.saved)
        }
    }
}
