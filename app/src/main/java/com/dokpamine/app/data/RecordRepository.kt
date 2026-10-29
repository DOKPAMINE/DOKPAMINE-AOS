package com.dokpamine.app.data

import androidx.room.withTransaction
import com.dokpamine.app.data.local.AppDatabase
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.local.QuoteEntity
import com.dokpamine.app.data.local.ReviewEntity
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.data.local.SessionSource
import com.dokpamine.app.data.local.Visibility
import com.dokpamine.app.data.sync.SyncScheduler
import com.dokpamine.app.domain.ManualSessionInput
import com.dokpamine.app.domain.ManualSessionRules
import kotlinx.coroutines.flow.Flow
import java.util.UUID

data class BookForm(
    val isbn: String?,
    val title: String,
    val author: String,
    val publisher: String?,
    val totalPages: Int,
    val genre: String,
    val coverUrl: String?,
    val status: BookStatus,
)

/** 개인 기록의 단일 진입점. 모든 쓰기는 로컬에 먼저 저장하고 동기화를 예약한다. */
class RecordRepository(
    private val db: AppDatabase,
    private val sync: SyncScheduler,
) {
    private val books = db.bookDao()
    private val sessions = db.sessionDao()
    private val reviews = db.reviewDao()
    private val quotes = db.quoteDao()

    private fun now() = System.currentTimeMillis()

    fun observeBooks(): Flow<List<BookEntity>> = books.observeAll()
    fun observeBook(id: String): Flow<BookEntity?> = books.observe(id)
    fun observeSessions(): Flow<List<SessionEntity>> = sessions.observeAll()
    fun observeSessions(bookId: String): Flow<List<SessionEntity>> = sessions.observeByBook(bookId)
    fun observeReview(bookId: String): Flow<ReviewEntity?> = reviews.observeByBook(bookId)
    fun observeQuotes(bookId: String): Flow<List<QuoteEntity>> = quotes.observeByBook(bookId)
    fun observePendingCount(): Flow<Int> = db.syncStatusDao().observePendingCount()

    suspend fun getBook(id: String): BookEntity? = books.get(id)?.takeUnless { it.deleted }
    suspend fun getSession(id: String): SessionEntity? = sessions.get(id)?.takeUnless { it.deleted }
    suspend fun findByIsbn(isbn: String): BookEntity? = books.findByIsbn(isbn)

    suspend fun addBook(form: BookForm): BookEntity {
        val t = now()
        val book = BookEntity(
            id = UUID.randomUUID().toString(),
            isbn = form.isbn,
            title = form.title.trim(),
            author = form.author.trim(),
            publisher = form.publisher?.trim()?.ifEmpty { null },
            totalPages = form.totalPages,
            genre = form.genre,
            coverUrl = form.coverUrl,
            status = form.status,
            currentPage = 0,
            completedCount = 0,
            completedAt = null,
            createdAt = t,
            updatedAt = t,
        )
        books.upsert(book)
        sync.request()
        return book
    }

    suspend fun updateBookInfo(id: String, form: BookForm) = editBook(id) {
        it.copy(
            isbn = form.isbn,
            title = form.title.trim(),
            author = form.author.trim(),
            publisher = form.publisher?.trim()?.ifEmpty { null },
            totalPages = form.totalPages,
            genre = form.genre,
            currentPage = it.currentPage.coerceAtMost(form.totalPages),
        )
    }

    suspend fun setStatus(id: String, status: BookStatus) = editBook(id) { it.copy(status = status) }

    /** PRD: 240/240쪽 입력만으로 자동 완독하지 않는다. 명시적 완독 확인으로만 완독 횟수가 오른다. */
    suspend fun markDone(id: String) = editBook(id) {
        if (it.status == BookStatus.DONE) it
        else it.copy(status = BookStatus.DONE, completedCount = it.completedCount + 1, completedAt = now())
    }

    /** 다시 읽기: 이전 기록은 그대로 두고 현재 페이지만 처음으로 돌린다. */
    suspend fun reread(id: String) = editBook(id) { it.copy(status = BookStatus.READING, currentPage = 0) }

    suspend fun deleteBook(id: String) {
        val t = now()
        db.withTransaction {
            books.get(id)?.let { books.upsert(it.copy(deleted = true, updatedAt = t, syncPending = true, localVersion = t)) }
            sessions.byBook(id).forEach { sessions.upsert(it.copy(deleted = true, syncPending = true, localVersion = t)) }
            reviews.byBook(id).forEach { reviews.upsert(it.copy(deleted = true, updatedAt = t, syncPending = true, localVersion = t)) }
            quotes.byBook(id).forEach { quotes.upsert(it.copy(deleted = true, updatedAt = t, syncPending = true, localVersion = t)) }
        }
        sync.request()
    }

    /**
     * 타이머 세션 저장(UC-02 ⑥). 세션 ID 는 타이머 시작 때 만든 값을 그대로 써서
     * 저장 버튼을 여러 번 눌러도 한 건만 남는다(FR-02 중복 종료).
     */
    suspend fun saveTimerSession(timer: TimerState, endPage: Int?, markDone: Boolean) {
        val t = now()
        val endedAt = timer.finishedAtMs ?: t
        db.withTransaction {
            sessions.upsert(
                SessionEntity(
                    id = timer.sessionId,
                    bookId = timer.bookId,
                    startedAt = timer.startedAtMs,
                    endedAt = endedAt,
                    activeSeconds = (timer.elapsedMs(endedAt) / 1000).toInt(),
                    startPage = timer.startPage,
                    endPage = endPage,
                    source = SessionSource.TIMER,
                    createdAt = t,
                ),
            )
            books.get(timer.bookId)?.let { book ->
                var updated = book.copy(
                    currentPage = endPage ?: book.currentPage,
                    status = if (book.status == BookStatus.WANT) BookStatus.READING else book.status,
                )
                if (markDone && book.status != BookStatus.DONE) {
                    updated = updated.copy(status = BookStatus.DONE, completedCount = book.completedCount + 1, completedAt = t)
                }
                books.upsert(updated.copy(updatedAt = t, syncPending = true, localVersion = t))
            }
        }
        sync.request()
    }

    /** T09: 화면 진입 시 정한 ID로 추가·수정하고 로컬 저장이 끝난 뒤 동기화를 예약한다. */
    suspend fun saveManualSession(id: String, bookId: String, startedAt: Long, minutes: String, startPage: String, endPage: String) {
        db.withTransaction {
            val book = books.get(bookId)?.takeUnless { it.deleted }
                ?: throw IllegalArgumentException("책을 찾을 수 없어요.")
            val existing = sessions.get(id)
            require(existing == null || (existing.bookId == bookId && !existing.deleted)) { "수정할 기록을 찾을 수 없어요." }
            val t = now()
            val input = when (val result = ManualSessionRules.validate(startedAt, minutes, startPage, endPage, book.totalPages, t)) {
                is ManualSessionInput.Invalid -> throw IllegalArgumentException(result.message)
                is ManualSessionInput.Valid -> result
            }
            sessions.upsert(ManualSessionRules.toSession(input, id, bookId, existing, t))
            if ((input.endPage ?: 0) > book.currentPage || book.status == BookStatus.WANT) {
                books.upsert(book.copy(
                    currentPage = maxOf(book.currentPage, input.endPage ?: book.currentPage),
                    status = if (book.status == BookStatus.WANT) BookStatus.READING else book.status,
                    updatedAt = t, syncPending = true, localVersion = maxOf(t, book.localVersion + 1),
                ))
            }
        }
        sync.request()
    }

    /** 세션 삭제 후 현재 페이지는 남은 기록 중 가장 최근의 유효한 페이지로 다시 계산한다. */
    suspend fun deleteSession(id: String) {
        val t = now()
        db.withTransaction {
            val session = sessions.get(id) ?: return@withTransaction
            sessions.upsert(session.copy(deleted = true, syncPending = true, localVersion = t))
            val book = books.get(session.bookId) ?: return@withTransaction
            val latest = sessions.byBook(book.id).filter { it.endPage != null }.maxByOrNull { it.startedAt }
            books.upsert(book.copy(currentPage = latest?.endPage ?: 0, updatedAt = t, syncPending = true, localVersion = t))
        }
        sync.request()
    }

    suspend fun saveReview(bookId: String, existing: ReviewEntity?, oneLine: String, body: String, visibility: Visibility) {
        val t = now()
        val review = (existing ?: ReviewEntity(UUID.randomUUID().toString(), bookId, null, null, createdAt = t, updatedAt = t))
            .copy(
                oneLine = oneLine.trim().ifEmpty { null },
                body = body.trim().ifEmpty { null },
                visibility = visibility,
                updatedAt = t,
                syncPending = true,
                localVersion = t,
            )
        reviews.upsert(review)
        sync.request()
    }

    suspend fun addQuote(bookId: String, text: String, page: Int?, memo: String?) {
        val t = now()
        quotes.upsert(QuoteEntity(UUID.randomUUID().toString(), bookId, text.trim(), page, memo?.trim()?.ifEmpty { null }, createdAt = t, updatedAt = t))
        sync.request()
    }

    suspend fun deleteQuote(id: String) {
        val t = now()
        quotes.get(id)?.let { quotes.upsert(it.copy(deleted = true, updatedAt = t, syncPending = true, localVersion = t)) }
        sync.request()
    }

    private suspend fun editBook(id: String, change: (BookEntity) -> BookEntity) {
        val book = books.get(id) ?: return
        val t = now()
        books.upsert(change(book).copy(updatedAt = t, syncPending = true, localVersion = t))
        sync.request()
    }
}
