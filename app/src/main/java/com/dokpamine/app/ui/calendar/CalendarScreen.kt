package com.dokpamine.app.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.domain.Stats
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.book.pageLabel
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.EmptyState
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.theme.Dok
import java.time.LocalDate
import java.time.YearMonth

class CalendarViewModel(c: AppContainer) : ViewModel() {
    val books = c.records.observeBooks()
    val sessions = c.records.observeSessions()
}

@Composable
fun MonthHeader(month: YearMonth, onChange: (YearMonth) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onChange(month.minusMonths(1)) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "이전 달") }
        Text("${month.year}년 ${month.monthValue}월", style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        IconButton(onClick = { onChange(month.plusMonths(1)) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "다음 달") }
    }
}

/** 좌우로 넘겨 다른 달을 본다. */
fun Modifier.monthSwipe(month: YearMonth, onChange: (YearMonth) -> Unit) = pointerInput(month) {
    var total = 0f
    detectHorizontalDragGestures(
        onDragStart = { total = 0f },
        onDragEnd = {
            if (total > 120) onChange(month.minusMonths(1)) else if (total < -120) onChange(month.plusMonths(1))
        },
    ) { _, amount -> total += amount }
}

/** C01 독서 캘린더 / C02 날짜별 기록 / C03 기록 없는 날 (FR-05) */
@Composable
fun CalendarScreen(onOpenStats: () -> Unit, onOpenBook: (String) -> Unit) {
    val vm = appViewModel { CalendarViewModel(it) }
    val sessions by vm.sessions.collectAsStateWithLifecycle(initialValue = emptyList<SessionEntity>())
    val books by vm.books.collectAsStateWithLifecycle(initialValue = emptyList<BookEntity>())
    var monthText by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    val month = YearMonth.parse(monthText)
    var selected by remember { mutableStateOf<LocalDate?>(LocalDate.now()) }
    val changeMonth: (YearMonth) -> Unit = { monthText = it.toString(); selected = null }

    val days = Stats.readingDays(sessions, month)
    val bookById = books.associateBy { it.id }

    DokScreen(title = "독서 캘린더") {
        MonthHeader(month, changeMonth)
        DokCard(Modifier.monthSwipe(month, changeMonth)) {
            Row {
                listOf("월", "화", "수", "목", "금", "토", "일").forEach {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = Dok.Muted, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(8.dp))
            val offset = month.atDay(1).dayOfWeek.value - 1
            val cells = offset + month.lengthOfMonth()
            for (week in 0 until (cells + 6) / 7) {
                Row {
                    for (dow in 0 until 7) {
                        val day = week * 7 + dow - offset + 1
                        Box(Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                            if (day in 1..month.lengthOfMonth()) {
                                val date = month.atDay(day)
                                val isSelected = date == selected
                                Column(
                                    Modifier.size(38.dp).clip(CircleShape)
                                        .background(if (isSelected) Dok.Ink else Dok.Surface)
                                        .clickable { selected = date },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(
                                        "$day",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (isSelected) Dok.Lime else Dok.Ink,
                                    )
                                    // 기록 점: 실제로 읽은 날
                                    Box(
                                        Modifier.padding(top = 2.dp).size(5.dp).clip(CircleShape)
                                            .background(if (day in days) (if (isSelected) Dok.Lime else Dok.Moss) else androidx.compose.ui.graphics.Color.Transparent),
                                    )
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Text("· 실제 읽은 날", style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
        }

        val day = selected
        if (day != null) {
            val list = Stats.sessionsOn(sessions, day)
            if (list.isEmpty()) {
                EmptyState("${day.monthValue}월 ${day.dayOfMonth}일 · 독서 기록 없음", "이날은 저장된 독서 기록이 없어요.")
            } else {
                Text(
                    "${day.monthValue}월 ${day.dayOfMonth}일 · ${list.size}건 · ${formatDuration(list.sumOf { it.activeSeconds.toLong() })}",
                    style = MaterialTheme.typography.titleSmall,
                )
                list.forEach { s ->
                    val book = bookById[s.bookId]
                    DokCard(onClick = book?.let { { onOpenBook(it.id) } }) {
                        Text(book?.title ?: "삭제된 책", style = MaterialTheme.typography.labelLarge)
                        Spacer(Modifier.width(4.dp))
                        Text("${formatDuration(s.activeSeconds.toLong())} · ${s.pageLabel()}", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
                    }
                }
            }
        } else if (days.isEmpty()) {
            EmptyState("아직 조용한 달이에요", "이 달에는 저장된 독서 기록이 없어요.\n책을 읽고 기록하면 이곳에 표시돼요.")
        }
        OutlineButton("월간 통계 보기", onOpenStats)
        Text("좌우로 넘겨 다른 달을 확인해요", style = MaterialTheme.typography.labelSmall, color = Dok.Muted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}
