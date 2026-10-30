package com.dokpamine.app.ui.lounge

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.OFFLINE_MESSAGE
import com.dokpamine.app.data.remote.FeedItem
import com.dokpamine.app.data.remote.RankingResponse
import com.dokpamine.app.data.remote.userMessage
import com.dokpamine.app.domain.formatDuration
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.ChoiceChip
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.EmptyState
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.SecondaryButton
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch

sealed interface Remote<out T> {
    data object Loading : Remote<Nothing>
    data class Ready<T>(val data: T) : Remote<T>
    data class Failed(val message: String) : Remote<Nothing>
}

class LoungeViewModel(val c: AppContainer) : ViewModel() {
    var feed by mutableStateOf<Remote<List<FeedItem>>>(Remote.Loading)
        private set
    var ranking by mutableStateOf<Remote<RankingResponse>>(Remote.Loading)
        private set
    val account = c.accounts.account

    /** NFR-06: 오프라인이면 요청하지 않고 바로 안내한다. */
    private suspend fun <T> load(block: suspend () -> T): Remote<T> =
        if (!c.connectivity.isOnline()) Remote.Failed(OFFLINE_MESSAGE)
        else runCatching { Remote.Ready(block()) }.getOrElse { Remote.Failed(it.userMessage()) }

    fun loadFeed() = viewModelScope.launch {
        feed = Remote.Loading
        feed = load { c.api.feed() }
    }

    fun loadRanking() = viewModelScope.launch {
        ranking = Remote.Loading
        ranking = load { c.api.weeklyRanking() }
    }

    fun setOptIn(optIn: Boolean) = viewModelScope.launch {
        runCatching { c.accounts.setRankingOptIn(optIn) }
            .onSuccess { loadRanking() }
            .onFailure { ranking = Remote.Failed(it.userMessage()) }
    }
}

/** F01 독서 라운지(감상 피드) / L01~L05 독서왕 랭킹 */
@Composable
fun LoungeScreen(onOpenPost: (String) -> Unit) {
    val vm = appViewModel { LoungeViewModel(it) }
    var tab by rememberSaveable { mutableStateOf(0) }
    LaunchedEffect(tab) { if (tab == 0) vm.loadFeed() else vm.loadRanking() }

    DokScreen(title = "독서 라운지", subtitle = "한 권의 책, 서로 다른 여운") {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ChoiceChip("감상 피드", tab == 0, { tab = 0 }, Modifier.weight(1f))
            ChoiceChip("독서왕 랭킹", tab == 1, { tab = 1 }, Modifier.weight(1f))
        }
        if (tab == 0) FeedTab(vm, onOpenPost) else RankingTab(vm)
    }
}

@Composable
private fun <T> RemoteContent(state: Remote<T>, onRetry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        Remote.Loading -> CircularProgressIndicator(color = Dok.Moss)
        is Remote.Failed -> {
            InfoBanner(state.message)
            SecondaryButton("다시 시도", onRetry, Modifier)
        }
        is Remote.Ready -> content(state.data)
    }
}

@Composable
private fun FeedTab(vm: LoungeViewModel, onOpenPost: (String) -> Unit) {
    RemoteContent(vm.feed, { vm.loadFeed() }) { items ->
        if (items.isEmpty()) EmptyState("아직 공개된 감상이 없어요", "책 상세 > 감상·문장에서 감상을 공개하면 이곳에 올라와요.")
        items.forEach { item -> FeedCard(item) { onOpenPost(item.id) } }
    }
}

@Composable
fun FeedCard(item: FeedItem, onClick: (() -> Unit)? = null) {
    DokCard(onClick = onClick) {
        Text(if (item.oneLine != null) "한줄평" else "독후감", style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
        Spacer(Modifier.height(4.dp))
        Text(item.nickname + if (item.mine) " (나)" else "", style = MaterialTheme.typography.titleSmall)
        Text(item.oneLine ?: item.body.orEmpty(), style = MaterialTheme.typography.bodySmall, maxLines = 2)
        Text("${item.bookTitle} · 좋아요 ${item.likeCount}", style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
    }
}

@Composable
private fun RankingTab(vm: LoungeViewModel) {
    RemoteContent(vm.ranking, { vm.loadRanking() }) { r ->
        Text("이번 주 · ${r.weekStart} 주 (KST 월요일 기준)", style = MaterialTheme.typography.labelMedium, color = Dok.Muted)
        if (!r.participating) {
            DokCard {
                Text("함께 읽기에 참여할까요?", style = MaterialTheme.typography.titleSmall)
                Text(
                    "참여하면 닉네임과 이번 주 타이머 독서 시간이 순위에 공개돼요. 하루 최대 180분까지 집계하고, 언제든 그만둘 수 있어요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Dok.Muted,
                )
            }
            PrimaryButton("랭킹 참여하기", { vm.setOptIn(true) })
        }
        if (r.entries.isEmpty()) EmptyState("아직 이번 주 기록이 없어요", "타이머로 읽은 시간만 순위에 반영돼요.")
        r.entries.forEach { e ->
            DokCard {
                Row {
                    Text("${e.rank}위", style = MaterialTheme.typography.titleSmall, color = if (e.me) Dok.Moss else Dok.Ink, modifier = Modifier.weight(0.25f))
                    Text(e.nickname + if (e.me) " (나)" else "", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    Text(formatDuration(e.seconds), style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
                }
            }
        }
        if (r.participating) SecondaryButton("랭킹 참여 그만두기", { vm.setOptIn(false) }, Modifier)
    }
}
