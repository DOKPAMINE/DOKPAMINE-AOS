package com.dokpamine.app.ui.book

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.BookCover
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.ProgressBar
import com.dokpamine.app.ui.components.SecondaryButton
import com.dokpamine.app.ui.components.SectionTitle
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.components.SessionSourceBadge
import com.dokpamine.app.ui.components.label
import com.dokpamine.app.ui.theme.Dok
import com.dokpamine.app.ui.timer.rememberStartReading
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class BookDetailViewModel(val c: AppContainer, bookId: String) : ViewModel() {
    val book = c.records.observeBook(bookId)
    val sessions = c.records.observeSessions(bookId)
}

private val sessionFormat = DateTimeFormatter.ofPattern("M월 d일 (E) HH:mm")

fun SessionEntity.whenLabel(): String =
    Instant.ofEpochMilli(startedAt).atZone(ZoneId.systemDefault()).format(sessionFormat)

fun SessionEntity.pageLabel(): String = when {
    endPage == null -> "페이지 미기록"
    endPage < startPage -> "${startPage}→${endPage}쪽 · 되돌아 읽기"
    else -> "${startPage}→${endPage}쪽 · ${pagesRead}쪽"
}

/** B01 책 정보 / B02~B04 상태별 / D01 책 삭제 확인 / FR-04 기록 목록 */
@Composable
fun BookDetailScreen(
    bookId: String, onBack: () -> Unit, onEdit: () -> Unit, onNotes: () -> Unit, onOpenTimer: () -> Unit,
    onAddSession: () -> Unit, onEditSession: (String) -> Unit,
) {
    val vm = appViewModel(key = "book-$bookId") { BookDetailViewModel(it, bookId) }
    val book by vm.book.collectAsStateWithLifecycle(initialValue = null)
    val sessions by vm.sessions.collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()
    val startReading = rememberStartReading(onOpenTimer)
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmDone by remember { mutableStateOf(false) }
    var sessionToDelete by remember { mutableStateOf<SessionEntity?>(null) }

    val b = book ?: run {
        DokScreen(title = "책 정보", onBack = onBack) { Text("책을 불러오는 중이에요…", color = Dok.Muted) }
        return
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("책을 삭제할까요?") },
            text = { Text("이 책의 독서 기록, 감상, 문장도 함께 지워지고 통계가 다시 계산돼요.") },
            confirmButton = {
                TextButton(onClick = { scope.launch { vm.c.records.deleteBook(b.id); onBack() } }) { Text("삭제", color = Dok.Error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("취소") } },
        )
    }
    if (confirmDone) {
        AlertDialog(
            onDismissRequest = { confirmDone = false },
            title = { Text("완독으로 표시할까요?") },
            text = { Text("완독 횟수가 1회 늘어나고 '다 읽음' 칸으로 옮겨져요.") },
            confirmButton = { TextButton(onClick = { scope.launch { vm.c.records.markDone(b.id) }; confirmDone = false }) { Text("완독") } },
            dismissButton = { TextButton(onClick = { confirmDone = false }) { Text("취소") } },
        )
    }
    sessionToDelete?.let { s ->
        AlertDialog(
            onDismissRequest = { sessionToDelete = null },
            title = { Text("이 기록을 삭제할까요?") },
            text = { Text("${s.whenLabel()} · ${formatDuration(s.activeSeconds.toLong())}\n현재 페이지는 남은 기록 기준으로 다시 계산돼요.") },
            confirmButton = {
                TextButton(onClick = { scope.launch { vm.c.records.deleteSession(s.id) }; sessionToDelete = null }) { Text("삭제", color = Dok.Error) }
            },
            dismissButton = { TextButton(onClick = { sessionToDelete = null }) { Text("취소") } },
        )
    }

    DokScreen(
        title = "책 정보",
        onBack = onBack,
        actions = { IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Outlined.Delete, contentDescription = "책 삭제") } },
    ) {
        DokCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BookCover(b, width = 72.dp)
                Spacer(Modifier.width(14.dp))
                BookHeadline(b.status.label(), b.title, "${b.author} · ${b.genre} · ${b.totalPages}쪽${b.publisher?.let { " · $it" } ?: ""}")
            }
        }
        ProgressBar(b.progressPercent)
        Text("진행률 ${b.progressPercent}%", style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
        StatRow(
            "${b.currentPage} / ${b.totalPages}쪽" to "현재 페이지",
            formatDuration(sessions.sumOf { it.activeSeconds.toLong() }) to "누적 독서",
        )
        if (b.completedCount > 0) Text("완독 ${b.completedCount}회", style = MaterialTheme.typography.labelMedium, color = Dok.Moss)

        when (b.status) {
            BookStatus.WANT -> PrimaryButton("읽기 시작하기", { startReading(b) })
            BookStatus.READING -> PrimaryButton("이어서 읽기", { startReading(b) })
            BookStatus.DONE -> PrimaryButton("다시 읽기", { scope.launch { vm.c.records.reread(b.id) } })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton("감상·문장", onNotes, Modifier.weight(1f))
            SecondaryButton("정보 편집", onEdit, Modifier.weight(1f))
        }
        if (b.status != BookStatus.DONE) OutlineButton("완독으로 표시", { confirmDone = true })

        SectionTitle("기록 목록 ${sessions.size}건")
        OutlineButton("기록 직접 추가", onAddSession)
        if (sessions.isEmpty()) {
            Text("아직 기록이 없어요. 타이머나 직접 입력으로 독서를 남겨 보세요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
        }
        sessions.forEach { s ->
            DokCard(onClick = { onEditSession(s.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.whenLabel(), style = MaterialTheme.typography.labelMedium)
                        SessionSourceBadge(s.source)
                    }
                    IconButton(onClick = { sessionToDelete = s }) { Icon(Icons.Outlined.Delete, contentDescription = "${s.whenLabel()} 기록 삭제") }
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    "${formatDuration(s.activeSeconds.toLong())} · ${s.pageLabel()}${if (s.syncPending) " · 동기화 대기" else ""}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Dok.Muted,
                )
            }
        }
    }
}

@Composable
private fun BookHeadline(label: String, title: String, meta: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
        Spacer(Modifier.height(4.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(2.dp))
        Text(meta, style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
    }
}
