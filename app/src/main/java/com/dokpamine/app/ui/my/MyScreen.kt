package com.dokpamine.app.ui.my

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.remote.userMessage
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.StatRow
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MyViewModel(val c: AppContainer) : ViewModel() {
    val account = c.accounts.account
    val authExpired = c.accounts.authExpired
    val pending = c.records.observePendingCount()
    val lastSync = c.preferences.lastSyncAt
    val books = c.records.observeBooks()
    val sessions = c.records.observeSessions()
}

/** P01 마이 독파민 / P03 설정 / 로그아웃 (FR-10) */
@Composable
fun MyScreen() {
    val vm = appViewModel { MyViewModel(it) }
    val account by vm.account.collectAsStateWithLifecycle(initialValue = null)
    val expired by vm.authExpired.collectAsStateWithLifecycle(initialValue = false)
    val pending by vm.pending.collectAsStateWithLifecycle(initialValue = 0)
    val lastSync by vm.lastSync.collectAsStateWithLifecycle(initialValue = null)
    val books by vm.books.collectAsStateWithLifecycle(initialValue = emptyList())
    val sessions by vm.sessions.collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()
    var confirmLogout by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("로그아웃할까요?") },
            text = {
                Text(
                    if (pending > 0) "아직 서버에 올라가지 않은 기록 ${pending}건이 이 기기에서 지워져요. 인터넷에 연결해 동기화한 뒤 로그아웃하는 걸 권해요."
                    else "이 기기의 기록은 지워지지만 서버에 저장돼 있어 다시 로그인하면 돌아와요.",
                )
            },
            confirmButton = { TextButton(onClick = { scope.launch { vm.c.accounts.logout() } }) { Text("로그아웃", color = Dok.Error) } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("취소") } },
        )
    }

    DokScreen(title = "마이 독파민", subtitle = account?.email) {
        DokCard {
            Text(account?.nickname.orEmpty(), style = MaterialTheme.typography.titleMedium)
            Text(if (account?.rankingOptIn == true) "독서왕 랭킹 참여 중" else "랭킹 미참여", style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
        }
        StatRow(
            "${books.size}권" to "책장",
            "${books.sumOf { it.completedCount }}회" to "완독",
            formatDuration(sessions.sumOf { it.activeSeconds.toLong() }) to "누적 독서",
        )
        StatRow("${books.count { it.status == BookStatus.READING }}권" to "읽는 중", "${sessions.size}번" to "독서 기록")

        Spacer(Modifier.height(8.dp))
        Text("동기화", style = MaterialTheme.typography.titleSmall)
        Text(
            buildString {
                append(if (pending > 0) "대기 ${pending}건 · " else "모두 서버에 저장됨 · ")
                append(lastSync?.let { "마지막 동기화 " + SimpleDateFormat("M/d HH:mm", Locale.KOREA).format(Date(it)) } ?: "아직 동기화 전")
            },
            style = MaterialTheme.typography.bodySmall,
            color = Dok.Muted,
        )
        OutlineButton("지금 동기화", { vm.c.syncScheduler.request(); message = "동기화를 요청했어요. 인터넷에 연결되면 올라가요." })

        if (expired && account != null) {
            InfoBanner("로그인이 만료됐어요. 비밀번호를 다시 입력하면 대기 중인 기록이 올라가요.")
            LabeledField("비밀번호", password, { password = it }, password = true)
            PrimaryButton("다시 로그인", {
                scope.launch {
                    runCatching { vm.c.accounts.login(account!!.email, password) }
                        .onSuccess { password = ""; message = "다시 로그인했어요." }
                        .onFailure { message = it.userMessage() }
                }
            })
        }
        message?.let { InfoBanner(it) }
        OutlineButton("로그아웃", { confirmLogout = true }, color = Dok.Error)
    }
}
