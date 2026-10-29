package com.dokpamine.app

import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.data.local.SessionSource
import com.dokpamine.app.domain.ManualSessionInput
import com.dokpamine.app.domain.ManualSessionRules
import com.dokpamine.app.domain.Stats
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset

/** T09 수용 기준을 Given/When/Then으로 검증한다. */
class ManualSessionRulesTest {
    private val startedAt = Instant.parse("2026-10-29T12:00:00Z").toEpochMilli()
    private val now = startedAt + 3_600_000

    private fun validate(minutes: String = "20", start: String = "30", end: String = "50", at: Long = startedAt) =
        ManualSessionRules.validate(at, minutes, start, end, totalPages = 200, now = now)

    @Test
    fun `수동 세션 독서 시간이 0분이면 오류`() {
        // Given 독서 시간이 0분일 때 / When 수동 기록을 검증하면 / Then 오류를 반환한다.
        assertTrue(validate(minutes = "0") is ManualSessionInput.Invalid)
    }

    @Test
    fun `수동 세션 종료 페이지가 전체 쪽수를 넘으면 오류`() {
        // Given 전체 200쪽인 책 / When 종료 201쪽을 입력하면 / Then 오류를 반환한다.
        assertTrue(validate(end = "201") is ManualSessionInput.Invalid)
    }

    @Test
    fun `수동 세션 종료 시각이 미래면 오류`() {
        // Given 현재 시각에 시작할 때 / When 1분을 기록하면 / Then 미래 종료라서 거절한다.
        assertTrue(validate(minutes = "1", at = now) is ManualSessionInput.Invalid)
    }

    @Test
    fun `수동 세션 정상 입력이면 종료 시각과 초를 분으로 계산한다`() {
        // Given 20분 독서 / When 검증하면 / Then 종료는 시작+20분이고 활동 시간은 1200초다.
        val result = validate() as ManualSessionInput.Valid
        assertEquals(startedAt + 20 * 60_000L, result.endedAt)
        assertEquals(20 * 60, result.activeSeconds)
        assertEquals(30, result.startPage)
        assertEquals(50, result.endPage)
    }

    @Test
    fun `타이머 세션 수정 시 같은 아이디와 생성 시각을 유지하고 MANUAL로 바뀐다`() {
        // Given 동기화된 TIMER 기록 / When 수동으로 수정하면 / Then MANUAL과 동기화 대기가 된다.
        val original = SessionEntity("session-id", "book-id", startedAt, startedAt + 60_000, 60, 0, 10,
            SessionSource.TIMER, createdAt = startedAt - 1000, syncPending = false, localVersion = now)
        val edited = ManualSessionRules.toSession(validate() as ManualSessionInput.Valid, original.id, original.bookId, original, now)
        assertEquals(SessionSource.MANUAL, edited.source)
        assertEquals(original.id, edited.id)
        assertEquals(original.createdAt, edited.createdAt)
        assertTrue(edited.syncPending)
        assertTrue(edited.localVersion > original.localVersion)
    }

    @Test
    fun `수동 세션을 같은 아이디로 재저장해도 생성 시각을 보존한다`() {
        // Given 화면 진입 시 만든 UUID / When 같은 ID로 다시 저장하면 / Then 동일 기록을 덮어쓴다.
        val input = validate() as ManualSessionInput.Valid
        val first = ManualSessionRules.toSession(input, "stable-client-uuid", "book-id", null, now)
        val second = ManualSessionRules.toSession(input, first.id, first.bookId, first, now + 1)
        assertEquals(first.id, second.id)
        assertEquals(first.createdAt, second.createdAt)
        assertEquals(SessionSource.MANUAL, second.source)
    }

    @Test
    fun `수동 세션 종료 페이지가 빈칸이면 시간만 저장한다`() {
        // Given 종료 페이지가 빈칸일 때 / When 검증하면 / Then 종료 페이지는 null이다.
        val result = validate(end = "  ") as ManualSessionInput.Valid
        assertNull(result.endPage)
        assertEquals(1200, result.activeSeconds)
    }

    @Test
    fun `수동 세션 시작 페이지 범위와 종료 페이지 순서를 검증한다`() {
        // Given 0부터 200쪽인 책 / When 범위 밖이나 역순을 입력하면 / Then 오류를 반환한다.
        for (start in listOf("-1", "201", "1.5", "")) assertTrue(validate(start = start) is ManualSessionInput.Invalid)
        for (end in listOf("-1", "29", "50.5")) assertTrue(validate(end = end) is ManualSessionInput.Invalid)
        assertTrue(validate(start = "0", end = "0") is ManualSessionInput.Valid)
        assertTrue(validate(start = "200", end = "200") is ManualSessionInput.Valid)
    }

    @Test
    fun `수동 세션 분 입력의 정수 범위와 시각 오버플로를 검증한다`() {
        // Given 잘못된 분 입력 / When 검증하면 / Then 예외나 오버플로 없이 오류를 반환한다.
        for (minutes in listOf("", "-1", "1.5", "2147483647", "999999999999")) {
            assertTrue(validate(minutes = minutes) is ManualSessionInput.Invalid)
        }
        assertTrue(validate(at = Long.MAX_VALUE) is ManualSessionInput.Invalid)
        assertTrue(validate(minutes = "60") is ManualSessionInput.Valid) // 종료 시각이 현재와 같아도 허용한다.
    }

    @Test
    fun `수동 세션 날짜와 시작 시각을 엄격하게 해석한다`() {
        // Given 날짜와 24시간 시각 / When 해석하면 / Then 잘못된 날짜와 시각은 거절한다.
        assertEquals(startedAt, ManualSessionRules.parseStartedAt("2026-10-29", "12:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-02-30", "12:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-10-29", "24:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-10-29", "12:60", ZoneOffset.UTC))
    }

    @Test
    fun `수동 세션은 캘린더 통계와 연속 독서일에 포함된다`() {
        // Given 이틀 연속 수동 기록 / When 기존 개인 집계에 전달하면 / Then 시간과 쪽수 및 연속일에 포함된다.
        val input = validate() as ManualSessionInput.Valid
        val today = ManualSessionRules.toSession(input, "today", "book-id", null, now)
        val yesterday = today.copy(id = "yesterday", startedAt = today.startedAt - 86_400_000, endedAt = today.endedAt - 86_400_000)
        val list = listOf(today, yesterday)
        val day = LocalDate.of(2026, 10, 29)
        val book = BookEntity("book-id", null, "책", "작가", null, 200, "소설", null,
            BookStatus.READING, 50, 0, null, createdAt = startedAt, updatedAt = now)
        assertEquals(setOf(28, 29), Stats.readingDays(list, YearMonth.of(2026, 10), ZoneOffset.UTC))
        assertEquals(listOf(today), Stats.sessionsOn(list, day, ZoneOffset.UTC))
        val stats = Stats.monthly(list, listOf(book), YearMonth.of(2026, 10), ZoneOffset.UTC)
        assertEquals(2400L, stats.totalSeconds)
        assertEquals(40, stats.totalPages)
        assertEquals(2, Stats.streakDays(list, day, ZoneOffset.UTC))
    }
}
