package com.dokpamine.app.data.sync

import android.content.Context
import androidx.room.withTransaction
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.dokpamine.app.DokpamineApp
import com.dokpamine.app.data.Preferences
import com.dokpamine.app.data.local.AppDatabase
import com.dokpamine.app.data.remote.DokpamineApi
import com.dokpamine.app.data.remote.httpCode
import com.dokpamine.app.data.remote.toDto
import com.dokpamine.app.data.remote.toEntity
import kotlinx.coroutines.flow.first
import java.io.IOException
import java.util.concurrent.TimeUnit

class SyncScheduler(private val context: Context) {
    private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** 기록이 바뀔 때마다 호출한다. 네트워크가 돌아오면 WorkManager 가 곧바로 실행한다(NFR-05: 60초 이내). */
    fun request() {
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.APPEND_OR_REPLACE, work)
    }

    fun schedulePeriodic() {
        val work = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, work)
    }

    fun cancelAll() {
        WorkManager.getInstance(context).cancelUniqueWork(ONE_TIME)
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
    }

    private companion object {
        const val ONE_TIME = "sync"
        const val PERIODIC = "sync-periodic"
    }
}

sealed interface SyncResult {
    data object Done : SyncResult
    data object Retry : SyncResult
    data object AuthExpired : SyncResult
}

/**
 * 로컬의 대기 기록을 서버에 올린다. 책 → 세션 → 감상 → 문장 순서(세션·감상은 책을 참조).
 * 모든 요청은 클라이언트 ID 로 PUT 하므로 몇 번을 재전송해도 서버에는 한 건만 남는다.
 */
class SyncService(
    private val db: AppDatabase,
    private val api: DokpamineApi,
    private val prefs: Preferences,
) {
    suspend fun pushPending(): SyncResult {
        if (prefs.loadToken() == null) return SyncResult.Done
        var retry = false

        suspend fun <T> push(items: List<T>, send: suspend (T) -> Unit, done: suspend (T) -> Unit): SyncResult? {
            for (item in items) {
                try {
                    send(item)
                    done(item)
                } catch (e: Exception) {
                    when {
                        e.httpCode == 401 -> return SyncResult.AuthExpired
                        // 409: 참조하는 책이 아직 서버에 없음 → 다음 회차에 다시 시도
                        e is IOException || e.httpCode == 409 || (e.httpCode ?: 0) >= 500 -> retry = true
                        // 그 밖의 4xx 는 다시 보내도 같은 결과이므로 대기 목록에서 내린다.
                        else -> done(item)
                    }
                }
            }
            return null
        }

        val books = db.bookDao()
        push(books.pending(), { api.putBook(it.id, it.toDto()) }, { books.markSynced(it.id, it.localVersion) })?.let { return it }
        val sessions = db.sessionDao()
        push(sessions.pending(), { api.putSession(it.id, it.toDto()) }, { sessions.markSynced(it.id, it.localVersion) })?.let { return it }
        val reviews = db.reviewDao()
        push(reviews.pending(), { api.putReview(it.id, it.toDto()) }, { reviews.markSynced(it.id, it.localVersion) })?.let { return it }
        val quotes = db.quoteDao()
        push(quotes.pending(), { api.putQuote(it.id, it.toDto()) }, { quotes.markSynced(it.id, it.localVersion) })?.let { return it }

        if (!retry) prefs.setLastSyncAt(System.currentTimeMillis())
        return if (retry) SyncResult.Retry else SyncResult.Done
    }

    /** 로그인 직후 서버의 내 기록을 내려받아 로컬에 채운다. 아직 올라가지 않은 로컬 기록은 덮어쓰지 않는다. */
    suspend fun restoreSnapshot() {
        val snapshot = api.snapshot()
        db.withTransaction {
            val pendingBooks = db.bookDao().pending().map { it.id }.toSet()
            val pendingSessions = db.sessionDao().pending().map { it.id }.toSet()
            val pendingReviews = db.reviewDao().pending().map { it.id }.toSet()
            val pendingQuotes = db.quoteDao().pending().map { it.id }.toSet()
            db.bookDao().upsertAll(snapshot.books.filter { it.id !in pendingBooks }.map { it.toEntity() })
            db.sessionDao().upsertAll(snapshot.sessions.filter { it.id !in pendingSessions }.map { it.toEntity() })
            db.reviewDao().upsertAll(snapshot.reviews.filter { it.id !in pendingReviews }.map { it.toEntity() })
            db.quoteDao().upsertAll(snapshot.quotes.filter { it.id !in pendingQuotes }.map { it.toEntity() })
        }
        prefs.setLastSyncAt(System.currentTimeMillis())
    }

    suspend fun isLoggedIn() = prefs.account.first() != null
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as DokpamineApp).container
        return when (container.syncService.pushPending()) {
            SyncResult.Done -> Result.success()
            SyncResult.Retry -> if (runAttemptCount < 20) Result.retry() else Result.success()
            SyncResult.AuthExpired -> {
                // UC-02 8b: 재인증 안내. 대기 기록은 그대로 둔다.
                container.preferences.setAuthExpired()
                Result.success()
            }
        }
    }
}
