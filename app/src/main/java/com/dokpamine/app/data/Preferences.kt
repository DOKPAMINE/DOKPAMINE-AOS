package com.dokpamine.app.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private val Context.dataStore by preferencesDataStore("dokpamine")

@Serializable
data class Account(
    val userId: String,
    val email: String,
    val nickname: String,
    val rankingOptIn: Boolean,
    val accessToken: String,
)

/**
 * 진행 중인 독서 타이머. 화면 카운터가 아니라 시각으로 계산하므로 앱이 종료돼도 복원된다(UC-02 3a).
 * - accumulatedMs: 지금까지 측정된 시간(현재 실행 구간 제외)
 * - runningSinceMs: 측정 중이면 마지막 시작/재개 시각, 일시정지면 null
 * - finishedAtMs: 종료를 눌러 페이지 입력을 기다리는 중이면 종료 시각(UC-02 5a 초안 보존)
 */
@Serializable
data class TimerState(
    val sessionId: String,
    val bookId: String,
    val startPage: Int,
    val startedAtMs: Long,
    val accumulatedMs: Long = 0,
    val runningSinceMs: Long? = startedAtMs,
    val finishedAtMs: Long? = null,
    val endPageDraft: String = "",
) {
    val isRunning get() = runningSinceMs != null && finishedAtMs == null
    val isFinished get() = finishedAtMs != null

    fun elapsedMs(now: Long = System.currentTimeMillis()): Long =
        accumulatedMs + (runningSinceMs?.let { (now - it).coerceAtLeast(0) } ?: 0)

    fun paused(now: Long = System.currentTimeMillis()) =
        if (runningSinceMs == null) this else copy(accumulatedMs = elapsedMs(now), runningSinceMs = null)

    fun resumed(now: Long = System.currentTimeMillis()) = if (runningSinceMs != null) this else copy(runningSinceMs = now)

    fun finished(now: Long = System.currentTimeMillis()) =
        if (isFinished) this else paused(now).copy(finishedAtMs = now)
}

class Preferences(private val context: Context) {
    // 일시정지는 runningSinceMs = null 로 표현하므로 null·기본값을 생략하지 않고 그대로 저장해야 한다.
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = true
    }

    private object Keys {
        val account = stringPreferencesKey("account")
        val timer = stringPreferencesKey("timer")
        val authExpired = booleanPreferencesKey("auth_expired")
        val lastSyncAt = longPreferencesKey("last_sync_at")
        val askedNotification = booleanPreferencesKey("asked_notification")
    }

    /** OkHttp 인터셉터에서 동기적으로 읽기 위해 메모리에도 들고 있는다. */
    @Volatile var cachedToken: String? = null
        private set

    val account: Flow<Account?> = context.dataStore.data.map { prefs ->
        prefs[Keys.account]?.let { runCatching { json.decodeFromString<Account>(it) }.getOrNull() }
            .also { cachedToken = it?.accessToken }
    }

    val timer: Flow<TimerState?> = context.dataStore.data.map { prefs ->
        prefs[Keys.timer]?.let { runCatching { json.decodeFromString<TimerState>(it) }.getOrNull() }
    }

    val authExpired: Flow<Boolean> = context.dataStore.data.map { it[Keys.authExpired] ?: false }
    val lastSyncAt: Flow<Long?> = context.dataStore.data.map { it[Keys.lastSyncAt] }

    suspend fun loadToken(): String? = account.first()?.accessToken

    suspend fun saveAccount(account: Account?) {
        cachedToken = account?.accessToken
        context.dataStore.edit {
            if (account == null) it.remove(Keys.account) else it[Keys.account] = json.encodeToString(account)
            it[Keys.authExpired] = false
        }
    }

    suspend fun setAuthExpired() = context.dataStore.edit { it[Keys.authExpired] = true }

    suspend fun setLastSyncAt(time: Long) = context.dataStore.edit { it[Keys.lastSyncAt] = time }

    suspend fun currentTimer(): TimerState? = timer.first()

    suspend fun saveTimer(state: TimerState?) = context.dataStore.edit {
        if (state == null) it.remove(Keys.timer) else it[Keys.timer] = json.encodeToString(state)
    }

    /** 알림 권한은 처음 "독서 시작"을 누를 때 한 번만 요청한다(NFR-08). */
    suspend fun consumeNotificationAsk(): Boolean {
        var first = false
        context.dataStore.edit {
            first = it[Keys.askedNotification] != true
            it[Keys.askedNotification] = true
        }
        return first
    }

    suspend fun clearAll() = context.dataStore.edit { it.clear() }.also { cachedToken = null }
}
