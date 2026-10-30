package com.dokpamine.app.ui.lounge

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.OFFLINE_MESSAGE
import com.dokpamine.app.data.remote.FeedItem
import com.dokpamine.app.data.remote.userMessage
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch

class FeedDetailViewModel(private val c: AppContainer, private val id: String) : ViewModel() {
    var state by mutableStateOf<Remote<FeedItem>>(Remote.Loading)
        private set
    var likeError by mutableStateOf<String?>(null)
        private set
    private var liking = false

    init { load() }

    fun load() = viewModelScope.launch {
        state = Remote.Loading
        state = if (!c.connectivity.isOnline()) Remote.Failed(OFFLINE_MESSAGE)
        else runCatching { Remote.Ready(c.api.feedDetail(id)) }.getOrElse { Remote.Failed(it.userMessage()) }
    }

    /** FR-09: 낙관적으로 먼저 바꾸고, 실패하면 원래 값으로 되돌린다. */
    fun toggleLike() {
        val item = (state as? Remote.Ready)?.data ?: return
        if (liking) return
        if (!c.connectivity.isOnline()) {
            likeError = OFFLINE_MESSAGE
            return
        }
        liking = true
        likeError = null
        val optimistic = item.copy(likedByMe = !item.likedByMe, likeCount = item.likeCount + if (item.likedByMe) -1 else 1)
        state = Remote.Ready(optimistic)
        viewModelScope.launch {
            runCatching { if (item.likedByMe) c.api.unlike(id) else c.api.like(id) }
                .onSuccess { state = Remote.Ready(optimistic.copy(likeCount = it.likeCount, likedByMe = it.likedByMe)) }
                .onFailure {
                    state = Remote.Ready(item)
                    likeError = it.userMessage()
                }
            liking = false
        }
    }
}

/** F02 감상 상세 · 좋아요 */
@Composable
fun FeedDetailScreen(reviewId: String, onBack: () -> Unit) {
    val vm = appViewModel(key = "feed-$reviewId") { FeedDetailViewModel(it, reviewId) }
    DokScreen(title = "감상 이야기", onBack = onBack) {
        when (val s = vm.state) {
            Remote.Loading -> CircularProgressIndicator(color = Dok.Moss)
            is Remote.Failed -> {
                InfoBanner(s.message)
                OutlineButton("다시 시도", { vm.load() })
            }
            is Remote.Ready -> {
                val item = s.data
                DokCard {
                    Text("${item.bookTitle} · ${item.bookAuthor}", style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
                    Spacer(Modifier.height(6.dp))
                    Text(item.nickname + if (item.mine) " (나)" else "", style = MaterialTheme.typography.titleSmall)
                    item.oneLine?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.titleMedium)
                    }
                    item.body?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                vm.likeError?.let { InfoBanner(it) }
                PrimaryButton(
                    if (item.likedByMe) "♥ 좋아요 ${item.likeCount} · 취소하기" else "♡ 좋아요 ${item.likeCount}",
                    vm::toggleLike,
                )
                Text("댓글은 이번 학기 범위에서 제외했어요.", style = MaterialTheme.typography.labelSmall, color = Dok.Muted)
            }
        }
    }
}
