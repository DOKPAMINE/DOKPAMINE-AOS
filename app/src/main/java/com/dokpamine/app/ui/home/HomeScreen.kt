package com.dokpamine.app.ui.home

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.TimerState
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.domain.Stats
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.BookCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.EmptyState
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.theme.Dok
import com.dokpamine.app.ui.timer.rememberStartReading
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

data class HomeState(
    val nickname: String = "",
    val streakDays: Int = 0,
    val weekSeconds: Long = 0,
    val currentBook: BookEntity? = null,
    val timer: TimerState? = null,
    val timerBookTitle: String? = null,
    val hasBooks: Boolean = false,
    val pendingSync: Int = 0,
    val authExpired: Boolean = false,
)

class HomeViewModel(c: AppContainer) : ViewModel() {
    val state = combine(
        c.records.observeBooks(),
        c.records.observeSessions(),
        c.timer.state,
        c.records.observePendingCount(),
        combine(c.accounts.account, c.accounts.authExpired, ::Pair),
    ) { books, sessions, timer, pending, (account, expired) ->
        HomeState(
            nickname = account?.nickname.orEmpty(),
            streakDays = Stats.streakDays(sessions),
            weekSeconds = Stats.thisWeekSeconds(sessions),
            // H01: 가장 최근에 손댄 "읽는 중" 책을 이어 읽기 대상으로 보여준다.
            currentBook = books.firstOrNull { it.status == BookStatus.READING } ?: books.firstOrNull { it.status == BookStatus.WANT },
            timer = timer,
            timerBookTitle = timer?.let { t -> books.firstOrNull { it.id == t.bookId }?.title },
            hasBooks = books.isNotEmpty(),
            pendingSync = pending,
            authExpired = expired,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeState())
}

/** H00(빈 상태) / H01 홈 */
@Composable
fun HomeScreen(onAddBook: () -> Unit, onOpenBook: (String) -> Unit, onOpenTimer: () -> Unit) {
    val vm = appViewModel { HomeViewModel(it) }
    val s by vm.state.collectAsStateWithLifecycle()
    val startReading = rememberStartReading(onOpenTimer)

    DokScreen(title = "독파민", subtitle = if (s.nickname.isNotEmpty()) "${s.nickname}님, 책과 조금 더 가까워진 하루" else "책과 조금 더 가까워진 하루") {
        if (s.authExpired) InfoBanner("로그인이 만료됐어요. 마이 탭에서 다시 로그인하면 대기 중인 기록이 올라가요.")
        s.timer?.let { timer ->
            InfoBanner(
                if (timer.isFinished) "「${s.timerBookTitle}」 읽은 쪽을 아직 기록하지 않았어요 · 이어서 기록하기"
                else "「${s.timerBookTitle}」 ${if (timer.isRunning) "읽는 중" else "잠깐 쉬는 중"} · 타이머로 돌아가기",
                onClick = onOpenTimer,
            )
        }
        StatRow("${s.streakDays}일 연속" to "작은 습관", formatDuration(s.weekSeconds) to "이번 주")
        Spacer(Modifier.height(12.dp))

        val book = s.currentBook
        if (book != null) {
            BookCard(book, onClick = { onOpenBook(book.id) })
            Spacer(Modifier.height(12.dp))
            PrimaryButton("책 등록하기", onAddBook)
            PrimaryButton(if (book.status == BookStatus.WANT) "읽기 시작하기" else "이어서 읽기", { startReading(book) })
        } else {
            EmptyState(
                title = if (s.hasBooks) "지금 읽는 책이 없어요" else "아직 책장이 비어 있어요",
                message = "바코드를 찍으면 제목과 저자를 자동으로 채워 드려요.\n등록한 뒤 타이머로 오늘 독서를 기록해 보세요.",
            )
            PrimaryButton("책 등록하기", onAddBook)
        }

        if (s.pendingSync > 0) {
            Text(
                "동기화 대기 ${s.pendingSync}건 · 인터넷에 연결되면 자동으로 올라가요",
                style = MaterialTheme.typography.labelSmall,
                color = Dok.Muted,
            )
        }
    }
}
