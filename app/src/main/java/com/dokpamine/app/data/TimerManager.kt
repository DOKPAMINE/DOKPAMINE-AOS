package com.dokpamine.app.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.dokpamine.app.MainActivity
import com.dokpamine.app.R
import com.dokpamine.app.data.local.BookEntity
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * 사용자당 진행 중인 타이머는 하나(UC-02 2a). 상태는 DataStore 에 저장돼 앱을 강제 종료해도 복원된다.
 * 알림은 보조 수단이라 권한이 없어도 측정·저장은 정상 동작한다(NFR-08).
 */
class TimerManager(
    private val context: Context,
    private val prefs: Preferences,
) {
    val state: Flow<TimerState?> = prefs.timer

    suspend fun current(): TimerState? = prefs.currentTimer()

    suspend fun start(book: BookEntity): TimerState {
        val now = System.currentTimeMillis()
        val state = TimerState(
            sessionId = UUID.randomUUID().toString(),
            bookId = book.id,
            startPage = book.currentPage,
            startedAtMs = now,
        )
        prefs.saveTimer(state)
        notify(state, book.title)
        return state
    }

    suspend fun pause(bookTitle: String) = update(bookTitle) { it.paused() }
    suspend fun resume(bookTitle: String) = update(bookTitle) { it.resumed() }
    suspend fun finish(bookTitle: String) = update(bookTitle) { it.finished() }.also { cancelNotification() }

    suspend fun saveDraft(endPage: String) {
        prefs.currentTimer()?.let { prefs.saveTimer(it.copy(endPageDraft = endPage)) }
    }

    suspend fun clear() {
        prefs.saveTimer(null)
        cancelNotification()
    }

    private suspend fun update(bookTitle: String, change: (TimerState) -> TimerState): TimerState? {
        val next = prefs.currentTimer()?.let(change) ?: return null
        prefs.saveTimer(next)
        if (!next.isFinished) notify(next, bookTitle)
        return next
    }

    private fun notify(state: TimerState, bookTitle: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val manager = NotificationManagerCompat.from(context)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.timer_channel_name), NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_TIMER, true)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(bookTitle)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp)
        if (state.isRunning) {
            builder.setContentText("독서 중")
                .setUsesChronometer(true)
                .setWhen(System.currentTimeMillis() - state.elapsedMs())
                .setShowWhen(true)
        } else {
            builder.setContentText("잠깐 쉬는 중 · ${com.dokpamine.app.domain.formatClock(state.elapsedMs())}")
                .setShowWhen(false)
        }
        try {
            manager.notify(NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // 권한이 막 회수된 경우. 타이머 자체에는 영향이 없다.
        }
    }

    private fun cancelNotification() = NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)

    private companion object {
        const val CHANNEL_ID = "reading_timer"
        const val NOTIFICATION_ID = 1001
    }
}
