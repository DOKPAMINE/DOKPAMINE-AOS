package com.dokpamine.app.ui.calendar

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.domain.GenreStat
import com.dokpamine.app.domain.Stats
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.EmptyState
import com.dokpamine.app.ui.components.ProgressBar
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.theme.Dok
import java.time.YearMonth

/** C04 이달의 독서 취향 (FR-06): 월별 시간·쪽수, 장르·작가별 독서 시간 */
@Composable
fun StatsScreen(onBack: () -> Unit) {
    val vm = appViewModel { CalendarViewModel(it) }
    val sessions by vm.sessions.collectAsStateWithLifecycle(initialValue = emptyList<SessionEntity>())
    val books by vm.books.collectAsStateWithLifecycle(initialValue = emptyList<BookEntity>())
    var monthText by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val month = YearMonth.parse(monthText)
    val stats = Stats.monthly(sessions, books, month)

    DokScreen(title = "이달의 독서 취향", onBack = onBack) {
        MonthHeader(month) { monthText = it.toString() }
        StatRow("${stats.completedBooks}권" to "완독한 책", formatDuration(stats.totalSeconds) to "읽은 시간")
        StatRow("${stats.totalPages}쪽" to "읽은 쪽수", "${stats.sessionCount}번" to "독서 기록")

        if (stats.sessionCount == 0) {
            EmptyState("이 달의 독서 기록이 없어요", "기록이 쌓이면 장르와 작가별로 취향을 보여드려요.")
        } else {
            Breakdown("장르별 독서 시간", stats.byGenre, stats.totalSeconds, note = "책 등록 때 고른 대표 장르 기준 · 한 책에 장르 1개")
            Breakdown("작가별 독서 시간", stats.byAuthor.take(5), stats.totalSeconds, note = "상위 5명")
        }
    }
}

@Composable
private fun Breakdown(title: String, items: List<GenreStat>, total: Long, note: String) {
    DokCard {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(10.dp))
        items.forEach { item ->
            Row {
                Text(item.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text("${formatDuration(item.seconds)} · ${item.pages}쪽", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
            }
            Spacer(Modifier.height(4.dp))
            ProgressBar(if (total == 0L) 0 else (item.seconds * 100 / total).toInt())
            Spacer(Modifier.height(10.dp))
        }
        Text(note, style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
    }
}
