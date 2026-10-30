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
import java.time.ZoneId
import java.time.ZoneOffset

/** T09 수용 기준을 Given/When/Then으로 검증한다. */
class ManualSessionRulesTest {
    private val startedAt = Instant.parse("2026-10-29T12:00:00Z").toEpochMilli()
    private val now = startedAt + 3_600_000

    private fun validate(minutes: String = "20", start: String = "30", end: String = "50", at: Long = startedAt) =
        ManualSessionRules.validate(at, minutes, start, end, totalPages = 200, now = now)

    private fun session(id: String, at: Long, endPage: Int?, source: SessionSource = SessionSource.MANUAL) =
        SessionEntity(id, "book-id", at, at + 60_000, 60, 0, endPage, source, createdAt = at)

    @Test
    fun `T09 독서 시간이 0분이면 저장하지 않고 1분이면 저장한다`() {
        // Given 독서 시간이 0분 또는 1분일 때 / When 수동 기록을 검증하면 / Then 0분은 오류, 1분(60초)은 통과한다.
        assertTrue(validate(minutes = "0") is ManualSessionInput.Invalid)
        assertEquals(60, (validate(minutes = "1") as ManualSessionInput.Valid).activeSeconds)
    }

    @Test
    fun `T09 종료 페이지가 전체 쪽수를 넘으면 저장하지 않는다`() {
        // Given 전체 200쪽인 책 / When 종료 201쪽을 입력하면 / Then 오류를 반환한다.
        assertTrue(validate(end = "201") is ManualSessionInput.Invalid)
    }

    @Test
    fun `T09 종료 시각이 현재보다 1분 미래면 저장하지 않는다`() {
        // Given 현재 시각에 시작할 때 / When 1분을 기록하면 / Then 미래 종료라서 거절한다.
        val result = validate(minutes = "1", at = now)
        assertEquals(ManualSessionInput.Invalid("독서 종료 시각은 현재 시각을 넘을 수 없어요."), result)
    }

    @Test
    fun `T09 20분을 입력하면 종료 시각은 시작 후 20분이고 활동 시간은 1200초다`() {
        // Given 20분 독서 / When 검증하면 / Then 종료는 시작+20분(시작 이후)이고 활동 시간은 1200초다.
        val result = validate() as ManualSessionInput.Valid
        assertEquals(startedAt + 20 * 60_000L, result.endedAt)
        assertTrue(result.endedAt >= result.startedAt)
        assertEquals(20 * 60, result.activeSeconds)
        assertEquals(30, result.startPage)
        assertEquals(50, result.endPage)
    }

    @Test
    fun `T09 타이머 기록을 수정하면 같은 ID와 생성 시각을 유지하고 MANUAL이 된다`() {
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
    fun `T09 같은 클라이언트 UUID로 다시 저장하면 같은 기록 한 건을 덮어쓴다 (NFR-05)`() {
        // Given 화면 진입 시 만든 UUID / When 같은 ID로 다시 저장하면 / Then 동일 기록을 덮어쓴다.
        val input = validate() as ManualSessionInput.Valid
        val first = ManualSessionRules.toSession(input, "stable-client-uuid", "book-id", null, now)
        val second = ManualSessionRules.toSession(input, first.id, first.bookId, first, now + 1)
        assertEquals(first.id, second.id)
        assertEquals(first.createdAt, second.createdAt)
        assertEquals(SessionSource.MANUAL, second.source)
        assertEquals(1, listOf(first, second).distinctBy { it.id }.size)
    }

    @Test
    fun `T09 종료 페이지를 비우면 시간만 저장한다`() {
        // Given 종료 페이지가 빈칸일 때 / When 검증하면 / Then 종료 페이지는 null이다.
        val result = validate(end = "  ") as ManualSessionInput.Valid
        assertNull(result.endPage)
        assertEquals(1200, result.activeSeconds)
    }

    @Test
    fun `T09 시작 페이지는 0부터 전체 쪽수까지이고 종료 페이지는 시작 이상이다`() {
        // Given 0부터 200쪽인 책 / When 범위 밖이나 역순을 입력하면 / Then 오류를 반환한다.
        for (start in listOf("-1", "201", "1.5", "")) assertTrue(validate(start = start) is ManualSessionInput.Invalid)
        for (end in listOf("-1", "29", "50.5")) assertTrue(validate(end = end) is ManualSessionInput.Invalid)
        assertTrue(validate(start = "30", end = "30") is ManualSessionInput.Valid)
        assertTrue(validate(start = "0", end = "0") is ManualSessionInput.Valid)
        assertTrue(validate(start = "200", end = "200") is ManualSessionInput.Valid)
    }

    @Test
    fun `T09 분 입력이 정수가 아니거나 너무 크면 예외 없이 저장하지 않는다`() {
        // Given 잘못된 분 입력 / When 검증하면 / Then 예외나 오버플로 없이 오류를 반환한다.
        for (minutes in listOf("", "-1", "1.5", "2147483647", "999999999999")) {
            assertTrue(validate(minutes = minutes) is ManualSessionInput.Invalid)
        }
        assertTrue(validate(at = Long.MAX_VALUE) is ManualSessionInput.Invalid)
        assertTrue(validate(minutes = "60") is ManualSessionInput.Valid) // 종료 시각이 현재와 같아도 허용한다.
    }

    @Test
    fun `T09 날짜와 시작 시각은 엄격하게 해석하고 잘못된 값은 거절한다`() {
        // Given 날짜와 24시간 시각 / When 해석하면 / Then 잘못된 날짜와 시각은 거절한다.
        assertEquals(startedAt, ManualSessionRules.parseStartedAt("2026-10-29", "12:00", ZoneOffset.UTC))
        assertEquals(startedAt, ManualSessionRules.parseStartedAt(" 2026-10-29 ", " 12:00 ", ZoneOffset.UTC))
        assertEquals(Instant.parse("2026-10-29T14:59:00Z").toEpochMilli(),
            ManualSessionRules.parseStartedAt("2026-10-29", "23:59", ZoneId.of("Asia/Seoul")))
        assertNull(ManualSessionRules.parseStartedAt("2026-02-30", "12:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-10-29", "24:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-10-29", "12:60", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-10-29", "9:05", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026/10/29", "12:00", ZoneOffset.UTC))
    }

    @Test
    fun `T09 1900년 이전 날짜와 서머타임으로 없는 시각은 거절한다`() {
        // Given 연도 오타와 서머타임 공백 시각 / When 해석하면 / Then 다른 시각으로 옮기지 않고 거절한다.
        assertEquals(Instant.parse("1900-01-01T00:00:00Z").toEpochMilli(),
            ManualSessionRules.parseStartedAt("1900-01-01", "00:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("1899-12-31", "23:59", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("0226-10-29", "12:00", ZoneOffset.UTC))
        assertNull(ManualSessionRules.parseStartedAt("2026-03-08", "02:30", ZoneId.of("America/New_York")))
    }

    @Test
    fun `T09 가장 최근 기록으로 추가하면 현재 페이지가 그 종료 페이지가 된다`() {
        // Given 어제 100쪽까지 읽은 기록 / When 오늘 기록을 120쪽으로 추가하면 / Then 현재 페이지는 120쪽이다.
        val yesterday = session("yesterday", startedAt - 86_400_000, 100)
        val today = session("today", startedAt, 120)
        assertEquals(120, ManualSessionRules.currentPageAfterSave(100, 200, listOf(yesterday), listOf(yesterday, today)))
    }

    @Test
    fun `T09 과거 기록을 추가해도 현재 페이지는 바뀌지 않는다`() {
        // Given 다시 읽기로 현재 0쪽이고 최근 기록이 있을 때 / When 더 과거에 150쪽 기록을 추가하면 / Then 현재 페이지는 0쪽 그대로다.
        val latest = session("latest", startedAt, 100, SessionSource.TIMER)
        val old = session("old", startedAt - 86_400_000, 150)
        assertEquals(0, ManualSessionRules.currentPageAfterSave(0, 200, listOf(latest), listOf(latest, old)))
    }

    @Test
    fun `T09 가장 최근 기록의 종료 페이지를 줄이면 현재 페이지도 줄어든다`() {
        // Given 최근 기록 120쪽, 현재 120쪽 / When 그 기록을 80쪽으로 수정하면 / Then 현재 페이지는 80쪽이다.
        val older = session("older", startedAt - 86_400_000, 50)
        val latest = session("latest", startedAt, 120, SessionSource.TIMER)
        val edited = latest.copy(endPage = 80, source = SessionSource.MANUAL, localVersion = now)
        assertEquals(80, ManualSessionRules.currentPageAfterSave(120, 200, listOf(older, latest), listOf(older, edited)))
    }

    @Test
    fun `T09 가장 최근 기록을 시간만으로 바꾸면 그 이전 쪽수 기록을 따른다`() {
        // Given 최근 기록 120쪽, 이전 기록 50쪽 / When 최근 기록의 종료 페이지를 지우면 / Then 현재 페이지는 50쪽이다.
        val older = session("older", startedAt - 86_400_000, 50)
        val latest = session("latest", startedAt, 120)
        val timeOnly = latest.copy(endPage = null, localVersion = now)
        assertEquals(50, ManualSessionRules.currentPageAfterSave(120, 200, listOf(older, latest), listOf(older, timeOnly)))
        // 쪽수 기록이 하나도 남지 않으면 기록 삭제와 같이 0쪽이 된다.
        assertEquals(0, ManualSessionRules.currentPageAfterSave(120, 200, listOf(latest), listOf(timeOnly)))
    }

    @Test
    fun `T09 현재 페이지는 전체 쪽수를 넘지 않는다`() {
        // Given 책 쪽수를 150쪽으로 줄이기 전에 남은 180쪽 기록 / When 그 기록이 최근 기록이 되면 / Then 현재 페이지는 150쪽이다.
        val stale = session("stale", startedAt, 180)
        val newer = session("newer", startedAt + 60_000, 100)
        assertEquals(150, ManualSessionRules.currentPageAfterSave(100, 150, listOf(stale, newer), listOf(stale, newer.copy(startedAt = startedAt - 60_000))))
    }

    @Test
    fun `T09 수동 기록은 캘린더 통계와 연속 독서일에 포함된다`() {
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
