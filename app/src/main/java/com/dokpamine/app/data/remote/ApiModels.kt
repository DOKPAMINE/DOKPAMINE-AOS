package com.dokpamine.app.data.remote

import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.local.QuoteEntity
import com.dokpamine.app.data.local.ReviewEntity
import com.dokpamine.app.data.local.SessionEntity
import com.dokpamine.app.data.local.SessionSource
import com.dokpamine.app.data.local.Visibility
import kotlinx.serialization.Serializable
import java.time.Instant

// 서버(DOKPAMINE-BE)의 DTO 와 1:1 로 맞춘 전송 모델. 시각은 ISO-8601 문자열로 주고받는다.

@Serializable
data class SignupRequest(val email: String, val password: String, val nickname: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class MeResponse(val id: String, val email: String, val nickname: String, val rankingOptIn: Boolean)

@Serializable
data class TokenResponse(val accessToken: String, val expiresAt: String, val user: MeResponse)

@Serializable
data class UpdateMeRequest(val nickname: String? = null, val rankingOptIn: Boolean? = null)

@Serializable
data class ErrorResponse(val code: String, val message: String)

@Serializable
data class CatalogBook(
    val isbn: String,
    val title: String? = null,
    val author: String? = null,
    val publisher: String? = null,
    val totalPages: Int? = null,
    val genre: String? = null,
    val coverUrl: String? = null,
    val source: String,
)

@Serializable
data class BookDto(
    val id: String,
    val isbn: String? = null,
    val title: String,
    val author: String,
    val publisher: String? = null,
    val totalPages: Int,
    val genre: String,
    val coverUrl: String? = null,
    val status: BookStatus,
    val currentPage: Int,
    val completedCount: Int,
    val completedAt: String? = null,
    val deleted: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class SessionDto(
    val id: String,
    val bookId: String,
    val startedAt: String,
    val endedAt: String,
    val activeSeconds: Int,
    val startPage: Int,
    val endPage: Int? = null,
    val source: SessionSource,
    val deleted: Boolean = false,
    val createdAt: String,
)

@Serializable
data class ReviewDto(
    val id: String,
    val bookId: String,
    val oneLine: String? = null,
    val body: String? = null,
    val visibility: Visibility = Visibility.PRIVATE,
    val deleted: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class QuoteDto(
    val id: String,
    val bookId: String,
    val text: String,
    val page: Int? = null,
    val memo: String? = null,
    val deleted: Boolean = false,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class SnapshotResponse(
    val books: List<BookDto>,
    val sessions: List<SessionDto>,
    val reviews: List<ReviewDto>,
    val quotes: List<QuoteDto>,
)

@Serializable
data class FeedItem(
    val id: String,
    val nickname: String,
    val bookTitle: String,
    val bookAuthor: String,
    val genre: String,
    val oneLine: String? = null,
    val body: String? = null,
    val publishedAt: String? = null,
    val likeCount: Long,
    val likedByMe: Boolean,
    val mine: Boolean,
)

@Serializable
data class LikeResponse(val likeCount: Long, val likedByMe: Boolean)

@Serializable
data class RankingEntry(val rank: Int, val userId: String, val nickname: String, val seconds: Long, val me: Boolean)

@Serializable
data class RankingResponse(val weekStart: String, val participating: Boolean, val entries: List<RankingEntry>)

// --- Entity <-> DTO 변환 ---

private fun Long.iso(): String = Instant.ofEpochMilli(this).toString()
private fun String.epochMillis(): Long = Instant.parse(this).toEpochMilli()

fun BookEntity.toDto() = BookDto(
    id, isbn, title, author, publisher, totalPages, genre, coverUrl, status, currentPage, completedCount,
    completedAt?.iso(), deleted, createdAt.iso(), updatedAt.iso(),
)

fun BookDto.toEntity() = BookEntity(
    id = id, isbn = isbn, title = title, author = author, publisher = publisher, totalPages = totalPages, genre = genre,
    coverUrl = coverUrl, status = status, currentPage = currentPage, completedCount = completedCount,
    completedAt = completedAt?.epochMillis(), deleted = deleted, createdAt = createdAt.epochMillis(),
    updatedAt = updatedAt.epochMillis(), syncPending = false,
)

fun SessionEntity.toDto() = SessionDto(
    id, bookId, startedAt.iso(), endedAt.iso(), activeSeconds, startPage, endPage, source, deleted, createdAt.iso(),
)

fun SessionDto.toEntity() = SessionEntity(
    id = id, bookId = bookId, startedAt = startedAt.epochMillis(), endedAt = endedAt.epochMillis(),
    activeSeconds = activeSeconds, startPage = startPage, endPage = endPage, source = source, deleted = deleted,
    createdAt = createdAt.epochMillis(), syncPending = false,
)

fun ReviewEntity.toDto() = ReviewDto(id, bookId, oneLine, body, visibility, deleted, createdAt.iso(), updatedAt.iso())

fun ReviewDto.toEntity() = ReviewEntity(
    id = id, bookId = bookId, oneLine = oneLine, body = body, visibility = visibility, deleted = deleted,
    createdAt = createdAt.epochMillis(), updatedAt = updatedAt.epochMillis(), syncPending = false,
)

fun QuoteEntity.toDto() = QuoteDto(id, bookId, text, page, memo, deleted, createdAt.iso(), updatedAt.iso())

fun QuoteDto.toEntity() = QuoteEntity(
    id = id, bookId = bookId, text = text, page = page, memo = memo, deleted = deleted,
    createdAt = createdAt.epochMillis(), updatedAt = updatedAt.epochMillis(), syncPending = false,
)
