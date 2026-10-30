package com.dokpamine.app.data.local

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface BookDao {
    @Query("SELECT * FROM books WHERE deleted = 0 ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<BookEntity>>

    @Query("SELECT * FROM books WHERE id = :id AND deleted = 0")
    fun observe(id: String): Flow<BookEntity?>

    @Query("SELECT * FROM books WHERE id = :id")
    suspend fun get(id: String): BookEntity?

    @Query("SELECT * FROM books WHERE isbn = :isbn AND deleted = 0 LIMIT 1")
    suspend fun findByIsbn(isbn: String): BookEntity?

    @Query("SELECT * FROM books WHERE syncPending = 1")
    suspend fun pending(): List<BookEntity>

    @Upsert
    suspend fun upsert(book: BookEntity)

    @Upsert
    suspend fun upsertAll(books: List<BookEntity>)

    @Query("UPDATE books SET syncPending = 0 WHERE id = :id AND localVersion = :version")
    suspend fun markSynced(id: String, version: Long)
}

@Dao
interface SessionDao {
    @Query("SELECT * FROM sessions WHERE deleted = 0 ORDER BY startedAt DESC")
    fun observeAll(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE bookId = :bookId AND deleted = 0 ORDER BY startedAt DESC")
    fun observeByBook(bookId: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun get(id: String): SessionEntity?

    @Query("SELECT * FROM sessions WHERE bookId = :bookId AND deleted = 0")
    suspend fun byBook(bookId: String): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE syncPending = 1")
    suspend fun pending(): List<SessionEntity>

    @Upsert
    suspend fun upsert(session: SessionEntity)

    @Upsert
    suspend fun upsertAll(sessions: List<SessionEntity>)

    @Query("UPDATE sessions SET syncPending = 0 WHERE id = :id AND localVersion = :version")
    suspend fun markSynced(id: String, version: Long)
}

@Dao
interface ReviewDao {
    @Query("SELECT * FROM reviews WHERE bookId = :bookId AND deleted = 0 LIMIT 1")
    fun observeByBook(bookId: String): Flow<ReviewEntity?>

    @Query("SELECT * FROM reviews WHERE bookId = :bookId")
    suspend fun byBook(bookId: String): List<ReviewEntity>

    @Query("SELECT * FROM reviews WHERE syncPending = 1")
    suspend fun pending(): List<ReviewEntity>

    @Upsert
    suspend fun upsert(review: ReviewEntity)

    @Upsert
    suspend fun upsertAll(reviews: List<ReviewEntity>)

    @Query("UPDATE reviews SET syncPending = 0 WHERE id = :id AND localVersion = :version")
    suspend fun markSynced(id: String, version: Long)
}

@Dao
interface QuoteDao {
    @Query("SELECT * FROM quotes WHERE bookId = :bookId AND deleted = 0 ORDER BY createdAt DESC")
    fun observeByBook(bookId: String): Flow<List<QuoteEntity>>

    @Query("SELECT * FROM quotes WHERE id = :id")
    suspend fun get(id: String): QuoteEntity?

    @Query("SELECT * FROM quotes WHERE bookId = :bookId")
    suspend fun byBook(bookId: String): List<QuoteEntity>

    @Query("SELECT * FROM quotes WHERE syncPending = 1")
    suspend fun pending(): List<QuoteEntity>

    @Upsert
    suspend fun upsert(quote: QuoteEntity)

    @Upsert
    suspend fun upsertAll(quotes: List<QuoteEntity>)

    @Query("UPDATE quotes SET syncPending = 0 WHERE id = :id AND localVersion = :version")
    suspend fun markSynced(id: String, version: Long)
}

@Dao
interface SyncStatusDao {
    @Query(
        "SELECT (SELECT COUNT(*) FROM books WHERE syncPending = 1) + (SELECT COUNT(*) FROM sessions WHERE syncPending = 1)" +
            " + (SELECT COUNT(*) FROM reviews WHERE syncPending = 1) + (SELECT COUNT(*) FROM quotes WHERE syncPending = 1)",
    )
    fun observePendingCount(): Flow<Int>
}
