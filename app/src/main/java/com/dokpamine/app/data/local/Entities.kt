package com.dokpamine.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

// 오프라인 우선: 모든 기록은 먼저 Room 에 저장하고 syncPending = true 로 표시한다.
// SyncWorker 가 서버에 올린 뒤, 그 사이 다시 수정되지 않았으면(localVersion 동일) syncPending 을 내린다.
// 삭제는 deleted = true 로 표시(tombstone)해 서버에도 삭제를 전달한다.

enum class BookStatus { WANT, READING, DONE }
enum class SessionSource { TIMER, MANUAL }
enum class Visibility { PRIVATE, PUBLIC }

@Entity(tableName = "books", indices = [Index("isbn")])
data class BookEntity(
    @PrimaryKey val id: String,
    val isbn: String?,
    val title: String,
    val author: String,
    val publisher: String?,
    val totalPages: Int,
    val genre: String,
    val coverUrl: String?,
    val status: BookStatus,
    val currentPage: Int,
    val completedCount: Int,
    val completedAt: Long?,
    val deleted: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
    val syncPending: Boolean = true,
    val localVersion: Long = updatedAt,
) {
    val progressPercent: Int get() = if (totalPages <= 0) 0 else (currentPage * 100 / totalPages).coerceIn(0, 100)
}

@Entity(tableName = "sessions", indices = [Index("bookId"), Index("startedAt")])
data class SessionEntity(
    @PrimaryKey val id: String,
    val bookId: String,
    val startedAt: Long,
    val endedAt: Long,
    val activeSeconds: Int,
    val startPage: Int,
    val endPage: Int?,
    val source: SessionSource,
    val deleted: Boolean = false,
    val createdAt: Long,
    val syncPending: Boolean = true,
    val localVersion: Long = createdAt,
) {
    /** 이번 세션에 읽은 쪽수. 되돌아 읽기(끝 < 시작)나 페이지 미입력은 0 으로 본다. */
    val pagesRead: Int get() = endPage?.let { (it - startPage).coerceAtLeast(0) } ?: 0
}

@Entity(tableName = "reviews", indices = [Index("bookId")])
data class ReviewEntity(
    @PrimaryKey val id: String,
    val bookId: String,
    val oneLine: String?,
    val body: String?,
    val visibility: Visibility = Visibility.PRIVATE,
    val deleted: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
    val syncPending: Boolean = true,
    val localVersion: Long = updatedAt,
)

@Entity(tableName = "quotes", indices = [Index("bookId")])
data class QuoteEntity(
    @PrimaryKey val id: String,
    val bookId: String,
    val text: String,
    val page: Int?,
    val memo: String?,
    val deleted: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long,
    val syncPending: Boolean = true,
    val localVersion: Long = updatedAt,
)
