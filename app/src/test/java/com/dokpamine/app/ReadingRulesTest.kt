package com.dokpamine.app

import com.dokpamine.app.data.TimerState
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.data.local.SessionSource
import com.dokpamine.app.domain.EndPageInput
import com.dokpamine.app.domain.PageRules
import com.dokpamine.app.domain.Stats
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset

/** 요구사항 분석서의 Given/When/Then 을 그대로 옮긴 테스트. */
class ReadingRulesTest {
    private val zone = ZoneOffset.UTC

    @Test
    fun `FR-02 60초 측정, 30초 정지, 60초 측정하면 120초`() {
        val t0 = 1_000_000L
        var timer = TimerState("s", "b", 30, startedAtMs = t0)
        timer = timer.paused(t0 + 60_000)
        timer = timer.resumed(t0 + 90_000)
        timer = timer.finished(t0 + 150_000)
        assertEquals(120_000L, timer.elapsedMs(t0 + 999_999))
        // 중복 종료는 상태를 바꾸지 않는다.
        assertEquals(timer, timer.finished(t0 + 500_000))
    }

    @Test
    fun `일시정지 상태는 저장 후 다시 읽어도 일시정지로 복원된다 (UC-02 3a)`() {
        val json = kotlinx.serialization.json.Json { encodeDefaults = true; explicitNulls = true }
        val paused = TimerState("s", "b", 30, startedAtMs = 1_000L).paused(61_000L)
        val restored = json.decodeFromString<TimerState>(json.encodeToString(paused))
        assertEquals(paused, restored)
        assertEquals(60_000L, restored.elapsedMs(999_999L))
    }

    @Test
    fun `FR-03 시작 30쪽, 전체 200쪽에서 50쪽 입력하면 20쪽 읽고 진행률 25퍼센트`() {
        val parsed = PageRules.parseEndPage("50", startPage = 30, totalPages = 200)
        assertEquals(EndPageInput.Valid(50), parsed)
        assertEquals(20, session(start = 30, end = 50).pagesRead)
        assertEquals(25, PageRules.progressPercent(50, 200))
    }

    @Test
    fun `FR-03 음수, 소수, 전체 쪽수 초과는 저장하지 않고 시작 미만은 되돌아 읽기`() {
        assertTrue(PageRules.parseEndPage("-1", 30, 200) is EndPageInput.Invalid)
        assertTrue(PageRules.parseEndPage("50.5", 30, 200) is EndPageInput.Invalid)
        assertTrue(PageRules.parseEndPage("241", 30, 240) is EndPageInput.Invalid)
        assertEquals(EndPageInput.Reread(20), PageRules.parseEndPage("20", 30, 200))
        assertEquals(EndPageInput.TimeOnly, PageRules.parseEndPage("  ", 30, 200))
        // PRD: 112→80쪽 되돌아 읽기여도 음수 분량은 생기지 않는다.
        assertEquals(0, session(start = 112, end = 80).pagesRead)
    }

    @Test
    fun `FR-05 날짜를 고르면 그날의 세션만 보인다`() {
        val sessions = listOf(
            session(day = LocalDate.of(2026, 10, 1)),
            session(day = LocalDate.of(2026, 10, 1)),
            session(day = LocalDate.of(2026, 10, 3)),
        )
        assertEquals(setOf(1, 3), Stats.readingDays(sessions, YearMonth.of(2026, 10), zone))
        assertEquals(2, Stats.sessionsOn(sessions, LocalDate.of(2026, 10, 1), zone).size)
        assertEquals(0, Stats.sessionsOn(sessions, LocalDate.of(2026, 10, 2), zone).size)
    }

    @Test
    fun `FR-06 10분 20쪽과 20분 30쪽이면 총 30분 50쪽, 장르별로도 합산`() {
        val day = LocalDate.of(2026, 10, 5)
        val sessions = listOf(
            session(seconds = 600, start = 0, end = 20, day = day, book = "sf"),
            session(seconds = 1200, start = 0, end = 30, day = day, book = "history"),
        )
        val books = listOf(book("sf", "SF"), book("history", "역사"))
        val stats = Stats.monthly(sessions, books, YearMonth.of(2026, 10), zone)
        assertEquals(1800L, stats.totalSeconds)
        assertEquals(50, stats.totalPages)
        assertEquals(listOf("역사", "SF"), stats.byGenre.map { it.label })

        val empty = Stats.monthly(sessions, books, YearMonth.of(2026, 11), zone)
        assertEquals(0L, empty.totalSeconds)
        assertEquals(0, empty.totalPages)
    }

    @Test
    fun `연속 독서일은 하루 1분 이상 읽은 날만 센다`() {
        val today = LocalDate.of(2026, 10, 10)
        val sessions = listOf(
            session(seconds = 120, day = today),
            session(seconds = 120, day = today.minusDays(1)),
            session(seconds = 30, day = today.minusDays(2)),
        )
        assertEquals(2, Stats.streakDays(sessions, today, zone))
    }

    private fun session(
        start: Int = 0,
        end: Int? = null,
        seconds: Int = 600,
        day: LocalDate = LocalDate.of(2026, 10, 1),
        book: String = "b",
    ): SessionEntity {
        val at = day.atTime(12, 0).toInstant(zone).toEpochMilli()
        return SessionEntity(
            id = "$book-$at-$seconds-$start", bookId = book, startedAt = at, endedAt = at + seconds * 1000L,
            activeSeconds = seconds, startPage = start, endPage = end, source = SessionSource.TIMER, createdAt = at,
        )
    }

    private fun book(id: String, genre: String) = BookEntity(
        id = id, isbn = null, title = id, author = "작가 $id", publisher = null, totalPages = 300, genre = genre,
        coverUrl = null, status = BookStatus.READING, currentPage = 0, completedCount = 0, completedAt = null,
        createdAt = 0, updatedAt = 0,
    )
}
