package com.dokpamine.app.domain

import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.SessionEntity
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

// 화면과 무관한 독서 규칙. 분석서의 수용 기준을 그대로 단위 테스트한다(ReadingRulesTest).

object Genres {
    val ALL = listOf("소설", "SF", "시/에세이", "인문", "역사", "사회/정치", "경제/경영", "자기계발", "과학", "예술", "만화", "기타")
}

sealed interface EndPageInput {
    /** 빈칸: 시간만 저장한다. */
    data object TimeOnly : EndPageInput
    data class Valid(val endPage: Int) : EndPageInput
    /** 시작 페이지보다 작음: 되돌아 읽기 확인이 필요하다. 쪽수 집계에서는 제외된다. */
    data class Reread(val endPage: Int) : EndPageInput
    data class Invalid(val message: String) : EndPageInput
}

object PageRules {
    /** FR-03: 음수·소수·전체 쪽수 초과는 저장하지 않는다. */
    fun parseEndPage(input: String, startPage: Int, totalPages: Int): EndPageInput {
        val text = input.trim()
        if (text.isEmpty()) return EndPageInput.TimeOnly
        val page = text.toIntOrNull() ?: return EndPageInput.Invalid("0 이상의 정수로 입력해 주세요.")
        return when {
            page < 0 -> EndPageInput.Invalid("0 이상의 정수로 입력해 주세요.")
            page > totalPages -> EndPageInput.Invalid("전체 쪽수(${totalPages}쪽)보다 클 수 없어요.")
            page < startPage -> EndPageInput.Reread(page)
            else -> EndPageInput.Valid(page)
        }
    }

    fun progressPercent(currentPage: Int, totalPages: Int): Int =
        if (totalPages <= 0) 0 else (currentPage * 100 / totalPages).coerceIn(0, 100)
}

data class GenreStat(val label: String, val seconds: Long, val pages: Int)

data class MonthlyStats(
    val month: YearMonth,
    val totalSeconds: Long,
    val totalPages: Int,
    val completedBooks: Int,
    val sessionCount: Int,
    val byGenre: List<GenreStat>,
    val byAuthor: List<GenreStat>,
)

object Stats {
    private fun Long.toLocalDate(zone: ZoneId): LocalDate = Instant.ofEpochMilli(this).atZone(zone).toLocalDate()

    fun sessionsOn(sessions: List<SessionEntity>, date: LocalDate, zone: ZoneId = ZoneId.systemDefault()) =
        sessions.filter { it.startedAt.toLocalDate(zone) == date }

    fun readingDays(sessions: List<SessionEntity>, month: YearMonth, zone: ZoneId = ZoneId.systemDefault()): Set<Int> =
        sessions.map { it.startedAt.toLocalDate(zone) }
            .filter { YearMonth.from(it) == month }
            .map { it.dayOfMonth }
            .toSet()

    /** FR-06: 월별 시간·쪽수 합계와 장르·작가별 독서 시간. 장르는 책 등록 시 고른 대표 장르 기준. */
    fun monthly(
        sessions: List<SessionEntity>,
        books: List<BookEntity>,
        month: YearMonth,
        zone: ZoneId = ZoneId.systemDefault(),
    ): MonthlyStats {
        val bookById = books.associateBy { it.id }
        val inMonth = sessions.filter { YearMonth.from(it.startedAt.toLocalDate(zone)) == month }

        fun groupBy(key: (BookEntity) -> String) = inMonth
            .groupBy { bookById[it.bookId]?.let(key) ?: "기타" }
            .map { (label, list) -> GenreStat(label, list.sumOf { it.activeSeconds.toLong() }, list.sumOf { it.pagesRead }) }
            .sortedByDescending { it.seconds }

        return MonthlyStats(
            month = month,
            totalSeconds = inMonth.sumOf { it.activeSeconds.toLong() },
            totalPages = inMonth.sumOf { it.pagesRead },
            completedBooks = books.count { b -> b.completedAt?.let { YearMonth.from(it.toLocalDate(zone)) == month } == true },
            sessionCount = inMonth.size,
            byGenre = groupBy { it.genre },
            byAuthor = groupBy { it.author },
        )
    }

    /** 오늘(또는 어제)까지 하루 1분 이상 읽은 날이 며칠 연속인지. */
    fun streakDays(sessions: List<SessionEntity>, today: LocalDate = LocalDate.now(), zone: ZoneId = ZoneId.systemDefault()): Int {
        val days = sessions.groupBy { it.startedAt.toLocalDate(zone) }
            .filterValues { list -> list.sumOf { it.activeSeconds } >= 60 }
            .keys
        var day = if (today in days) today else today.minusDays(1)
        var count = 0
        while (day in days) {
            count++
            day = day.minusDays(1)
        }
        return count
    }

    fun thisWeekSeconds(sessions: List<SessionEntity>, today: LocalDate = LocalDate.now(), zone: ZoneId = ZoneId.systemDefault()): Long {
        val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        return sessions.filter { it.startedAt.toLocalDate(zone) in monday..today }.sumOf { it.activeSeconds.toLong() }
    }
}

fun formatDuration(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return when {
        h > 0 && m > 0 -> "${h}시간 ${m}분"
        h > 0 -> "${h}시간"
        m > 0 -> "${m}분"
        seconds > 0 -> "${seconds}초"
        else -> "0분"
    }
}

fun formatClock(ms: Long): String {
    val total = ms / 1000
    return "%02d:%02d:%02d".format(total / 3600, (total % 3600) / 60, total % 60)
}
