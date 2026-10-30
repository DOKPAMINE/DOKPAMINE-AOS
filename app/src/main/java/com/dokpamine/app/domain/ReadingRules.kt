package com.dokpamine.app.domain

import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.data.local.SessionSource
import java.time.DateTimeException
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

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

sealed interface ManualSessionInput {
    data class Valid(
        val startedAt: Long,
        val endedAt: Long,
        val activeSeconds: Int,
        val startPage: Int,
        val endPage: Int?,
    ) : ManualSessionInput
    data class Invalid(val message: String) : ManualSessionInput
}

/** T09: 수동 기록도 개인 통계에는 포함하며, 수정한 TIMER 기록은 랭킹에서 제외한다. */
object ManualSessionRules {
    /** 연도 오타(0226년 등)가 기록·동기화되지 않도록 받는 가장 이른 날짜. */
    val MIN_DATE: LocalDate = LocalDate.of(1900, 1, 1)

    fun parseStartedAt(date: String, time: String, zone: ZoneId = ZoneId.systemDefault()): Long? = try {
        val day = LocalDate.parse(date.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
        val clock = LocalTime.parse(time.trim(), DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT))
        val local = day.atTime(clock)
        // 서머타임으로 존재하지 않는 시각을 다른 시각으로 조용히 이동시키지 않는다.
        if (day < MIN_DATE || zone.rules.getValidOffsets(local).isEmpty()) null else local.atZone(zone).toInstant().toEpochMilli()
    } catch (_: DateTimeException) {
        null
    } catch (_: ArithmeticException) {
        null
    }

    fun validate(
        startedAt: Long,
        minutes: String,
        startPage: String,
        endPage: String,
        totalPages: Int,
        now: Long,
    ): ManualSessionInput {
        val duration = minutes.trim().toIntOrNull()
        if (duration == null || duration < 1) return ManualSessionInput.Invalid("독서 시간은 1분 이상의 정수로 입력해 주세요.")
        if (duration > Int.MAX_VALUE / 60) return ManualSessionInput.Invalid("독서 시간을 더 짧게 입력해 주세요.")
        val seconds = duration * 60
        val endedAt = try {
            Math.addExact(startedAt, seconds * 1000L)
        } catch (_: ArithmeticException) {
            return ManualSessionInput.Invalid("독서 시간을 더 짧게 입력해 주세요.")
        }
        if (endedAt > now) return ManualSessionInput.Invalid("독서 종료 시각은 현재 시각을 넘을 수 없어요.")
        val start = startPage.trim().toIntOrNull()
        if (start == null || start < 0) return ManualSessionInput.Invalid("시작 페이지는 0 이상의 정수로 입력해 주세요.")
        if (start > totalPages) return ManualSessionInput.Invalid("시작 페이지는 전체 쪽수(${totalPages}쪽)를 넘을 수 없어요.")
        val end = when (val parsed = PageRules.parseEndPage(endPage, start, totalPages)) {
            EndPageInput.TimeOnly -> null
            is EndPageInput.Valid -> parsed.endPage
            is EndPageInput.Invalid -> return ManualSessionInput.Invalid(parsed.message)
            is EndPageInput.Reread -> return ManualSessionInput.Invalid("종료 페이지는 시작 페이지 이상으로 입력해 주세요.")
        }
        return ManualSessionInput.Valid(startedAt, endedAt, seconds, start, end)
    }

    /** 같은 ID로 덮어쓰며 생성 시각을 보존하고, 어떤 원본이든 MANUAL로 저장한다. */
    fun toSession(input: ManualSessionInput.Valid, id: String, bookId: String, existing: SessionEntity?, now: Long): SessionEntity {
        require(existing == null || (existing.id == id && existing.bookId == bookId && !existing.deleted))
        return SessionEntity(
            id = id, bookId = bookId, startedAt = input.startedAt, endedAt = input.endedAt,
            activeSeconds = input.activeSeconds, startPage = input.startPage, endPage = input.endPage,
            source = SessionSource.MANUAL, createdAt = existing?.createdAt ?: now,
            syncPending = true, localVersion = maxOf(now, existing?.localVersion?.plus(1) ?: now),
        )
    }

    /** 시작 시각이 가장 늦은, 종료 페이지가 있는 기록. 같은 시각이면 생성 순서·ID로 고정한다. */
    fun latestPaged(sessions: List<SessionEntity>): SessionEntity? = sessions
        .filter { !it.deleted && it.endPage != null }
        .maxWithOrNull(compareBy<SessionEntity>({ it.startedAt }, { it.createdAt }, { it.id }))

    /**
     * 기록 추가·수정 후 현재 페이지. 타이머 저장·기록 삭제처럼 가장 최근 쪽수 기록을 따르되,
     * 그 기록이 그대로면(과거 기록 추가, 다른 기록 수정) 현재 페이지(다시 읽기 0쪽 등)를 건드리지 않는다.
     */
    fun currentPageAfterSave(currentPage: Int, totalPages: Int, before: List<SessionEntity>, after: List<SessionEntity>): Int {
        val previous = latestPaged(before)
        val latest = latestPaged(after)
        if (previous == latest) return currentPage
        return (latest?.endPage ?: 0).coerceIn(0, maxOf(totalPages, 0))
    }
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
