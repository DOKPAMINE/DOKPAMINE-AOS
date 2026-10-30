package com.dokpamine.app.ui.notes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.dokpamine.app.data.local.QuoteEntity
import com.dokpamine.app.data.local.ReviewEntity
import com.dokpamine.app.data.local.Visibility
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.ChoiceChip
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.SecondaryButton
import com.dokpamine.app.ui.components.SectionTitle
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch

class NotesViewModel(val c: AppContainer, bookId: String) : ViewModel() {
    val book = c.records.observeBook(bookId)
    val review = c.records.observeReview(bookId)
    val quotes = c.records.observeQuotes(bookId)
}

/**
 * R01 나의 감상과 문장 / R02 한줄평 쓰기 / R03 문장 추가 / V01~V04 공개 설정 (FR-07, FR-08)
 * 새 감상의 공개 범위 기본값은 "나만 보기"다(NFR-09).
 */
@Composable
fun NotesScreen(bookId: String, onBack: () -> Unit) {
    val vm = appViewModel(key = "notes-$bookId") { NotesViewModel(it, bookId) }
    val book by vm.book.collectAsStateWithLifecycle(initialValue = null)
    val review by vm.review.collectAsStateWithLifecycle(initialValue = null)
    val quotes by vm.quotes.collectAsStateWithLifecycle(initialValue = emptyList())
    val scope = rememberCoroutineScope()

    var editingReview by remember { mutableStateOf(false) }
    var addingQuote by remember { mutableStateOf(false) }
    var quoteToDelete by remember { mutableStateOf<QuoteEntity?>(null) }
    var savedMessage by remember { mutableStateOf<String?>(null) }

    quoteToDelete?.let { q ->
        AlertDialog(
            onDismissRequest = { quoteToDelete = null },
            title = { Text("문장을 삭제할까요?") },
            text = { Text("“${q.text}”") },
            confirmButton = { TextButton(onClick = { scope.launch { vm.c.records.deleteQuote(q.id) }; quoteToDelete = null }) { Text("삭제", color = Dok.Error) } },
            dismissButton = { TextButton(onClick = { quoteToDelete = null }) { Text("취소") } },
        )
    }

    DokScreen(title = "나의 감상과 문장", onBack = onBack, subtitle = book?.title) {
        savedMessage?.let { InfoBanner(it) }
        when {
            editingReview -> ReviewEditor(review) { oneLine, body, visibility ->
                scope.launch {
                    vm.c.records.saveReview(bookId, review, oneLine, body, visibility)
                    editingReview = false
                    savedMessage = if (visibility == Visibility.PUBLIC) "감상을 라운지에 공개했어요." else "감상을 나만 보기로 저장했어요."
                }
            }
            addingQuote -> QuoteEditor(onCancel = { addingQuote = false }) { text, page, memo ->
                scope.launch {
                    vm.c.records.addQuote(bookId, text, page, memo)
                    addingQuote = false
                    savedMessage = "문장을 저장했어요."
                }
            }
            else -> {
                val r = review
                if (r != null) {
                    DokCard(onClick = { editingReview = true }) {
                        Text(r.visibility.label(), style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
                        Spacer(Modifier.height(4.dp))
                        Text(r.oneLine ?: "한줄평", style = MaterialTheme.typography.titleSmall)
                        r.body?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Dok.Muted, maxLines = 4) }
                    }
                }
                quotes.forEach { q ->
                    DokCard(onClick = { quoteToDelete = q }) {
                        Text("나만 보기", style = MaterialTheme.typography.labelSmall, color = Dok.Moss)
                        Spacer(Modifier.height(4.dp))
                        Text("좋아하는 문장${q.page?.let { " · ${it}쪽" } ?: ""}", style = MaterialTheme.typography.titleSmall)
                        Text("“${q.text}”", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
                        q.memo?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = Dok.Muted) }
                    }
                }
                if (r == null && quotes.isEmpty()) {
                    Text("아직 남긴 감상이 없어요. 한 줄이라도 적어 두면 오래 기억할 수 있어요.", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SecondaryButton(if (r == null) "한줄평 쓰기" else "감상 수정", { savedMessage = null; editingReview = true }, Modifier.weight(1f))
                    SecondaryButton("문장 추가", { savedMessage = null; addingQuote = true }, Modifier.weight(1f))
                }
            }
        }
    }
}

private fun Visibility.label() = if (this == Visibility.PUBLIC) "공개" else "나만 보기"

@Composable
private fun ReviewEditor(review: ReviewEntity?, onSave: (String, String, Visibility) -> Unit) {
    var oneLine by remember { mutableStateOf(review?.oneLine.orEmpty()) }
    var body by remember { mutableStateOf(review?.body.orEmpty()) }
    var visibility by remember { mutableStateOf(review?.visibility ?: Visibility.PRIVATE) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(review?.id) {
        oneLine = review?.oneLine.orEmpty(); body = review?.body.orEmpty(); visibility = review?.visibility ?: Visibility.PRIVATE
    }

    LabeledField("한줄평", oneLine, { oneLine = it; error = null }, maxLength = 100, placeholder = "낯선 우주에서 발견한 다정함.")
    LabeledField("독후감 (선택)", body, { body = it; error = null }, singleLine = false, minLines = 6, maxLength = 5000)
    SectionTitle("공개 범위")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ChoiceChip("나만 보기", visibility == Visibility.PRIVATE, { visibility = Visibility.PRIVATE }, Modifier.weight(1f))
        ChoiceChip("라운지에 공개", visibility == Visibility.PUBLIC, { visibility = Visibility.PUBLIC }, Modifier.weight(1f))
    }
    Text(
        if (visibility == Visibility.PUBLIC) "닉네임·책 제목·감상만 공개돼요. 독서 시간이나 사진은 함께 올라가지 않아요."
        else "나만 볼 수 있어요. 언제든 공개로 바꿀 수 있어요.",
        style = MaterialTheme.typography.labelSmall,
        color = Dok.Muted,
    )
    error?.let { Text(it, color = Dok.Error, style = MaterialTheme.typography.bodySmall) }
    PrimaryButton("감상 저장", {
        // FR-07: 공백뿐인 내용은 저장하지 않는다.
        if (oneLine.isBlank() && body.isBlank()) error = "한줄평이나 독후감 중 하나는 적어 주세요."
        else onSave(oneLine, body, visibility)
    })
}

@Composable
private fun QuoteEditor(onCancel: () -> Unit, onSave: (String, Int?, String?) -> Unit) {
    var text by remember { mutableStateOf("") }
    var page by remember { mutableStateOf("") }
    var memo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    LabeledField("좋아하는 문장", text, { text = it; error = null }, singleLine = false, minLines = 3, maxLength = 1000, error = error)
    LabeledField("쪽 (선택)", page, { page = it.filter(Char::isDigit) }, number = true)
    LabeledField("메모 (선택)", memo, { memo = it }, maxLength = 500)
    PrimaryButton("문장 저장", {
        if (text.isBlank()) error = "문장을 입력해 주세요." else onSave(text, page.toIntOrNull(), memo)
    })
    SecondaryButton("취소", onCancel, Modifier)
}
