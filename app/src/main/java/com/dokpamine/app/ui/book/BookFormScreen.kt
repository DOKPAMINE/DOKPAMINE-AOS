package com.dokpamine.app.ui.book

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokpamine.app.AppContainer
import com.dokpamine.app.data.BookForm
import com.dokpamine.app.data.OFFLINE_MESSAGE
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.data.remote.httpCode
import com.dokpamine.app.domain.Genres
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.BookCover
import com.dokpamine.app.ui.components.ChoiceChip
import com.dokpamine.app.ui.components.DokCard
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.InfoBanner
import com.dokpamine.app.ui.components.LabeledField
import com.dokpamine.app.ui.components.PrimaryButton
import com.dokpamine.app.ui.components.label
import com.dokpamine.app.ui.theme.Dok
import kotlinx.coroutines.launch

class BookFormViewModel(private val c: AppContainer, private val isbn: String?, private val editBookId: String?) : ViewModel() {
    var title by mutableStateOf("")
    var author by mutableStateOf("")
    var publisher by mutableStateOf("")
    var totalPages by mutableStateOf("")
    var genre by mutableStateOf<String?>(null)
    var status by mutableStateOf(BookStatus.READING)
    var coverUrl by mutableStateOf<String?>(null)

    var loading by mutableStateOf(isbn != null || editBookId != null)
        private set
    var notice by mutableStateOf<String?>(null)
        private set
    var showErrors by mutableStateOf(false)
        private set
    var duplicate by mutableStateOf<BookEntity?>(null)
        private set
    var saving by mutableStateOf(false)
        private set

    val isEdit = editBookId != null

    init {
        viewModelScope.launch {
            when {
                editBookId != null -> c.records.getBook(editBookId)?.let { fill(it) }
                isbn != null -> lookup(isbn)
            }
            loading = false
        }
    }

    private fun fill(b: BookEntity) {
        title = b.title; author = b.author; publisher = b.publisher.orEmpty()
        totalPages = b.totalPages.toString(); genre = b.genre; status = b.status; coverUrl = b.coverUrl
    }

    /** UC-01 ④~⑤: 중복 ISBN → 오프라인 → API 조회 순서. 실패해도 ISBN 을 유지한 직접 입력으로 이어진다. */
    private suspend fun lookup(isbn: String) {
        c.records.findByIsbn(isbn)?.let { duplicate = it; return }
        if (!c.connectivity.isOnline()) {
            notice = "오프라인이라 책 정보를 불러오지 못했어요. 직접 입력해 주세요."
            return
        }
        runCatching { c.api.lookupIsbn(isbn) }
            .onSuccess { found ->
                title = found.title.orEmpty(); author = found.author.orEmpty(); publisher = found.publisher.orEmpty()
                totalPages = found.totalPages?.toString().orEmpty(); genre = found.genre; coverUrl = found.coverUrl
                val missing = listOfNotNull(
                    "전체 쪽수".takeIf { found.totalPages == null },
                    "장르".takeIf { found.genre == null },
                )
                notice = if (missing.isEmpty()) "책 정보를 찾았어요. 맞는지 확인해 주세요."
                else "책 정보를 찾았지만 ${missing.joinToString("·")}가 없어요. 채워 주세요."
            }
            .onFailure {
                notice = when {
                    it.httpCode == 404 -> "이 책의 정보를 찾지 못했어요. ISBN 은 그대로 두고 직접 입력해 주세요."
                    !c.connectivity.isOnline() -> OFFLINE_MESSAGE
                    else -> "책 정보를 불러오지 못했어요. 직접 입력해 주세요."
                }
            }
    }

    val titleError get() = if (showErrors && title.isBlank()) "책 제목을 입력해 주세요." else null
    val authorError get() = if (showErrors && author.isBlank()) "저자를 입력해 주세요." else null
    val pagesError get() = if (showErrors && (totalPages.toIntOrNull() ?: 0) < 1) "전체 쪽수는 1 이상의 정수예요." else null
    val genreError get() = if (showErrors && genre == null) "장르를 하나 골라 주세요." else null

    /** FR-01: 제목·저자·쪽수·장르가 비면 저장하지 않는다. */
    fun save(onSaved: (String) -> Unit) {
        showErrors = true
        if (listOf(titleError, authorError, pagesError, genreError).any { it != null } || saving) return
        saving = true
        viewModelScope.launch {
            val form = BookForm(isbn, title, author, publisher, totalPages.toInt(), genre!!, coverUrl, status)
            if (editBookId != null) {
                val existing = c.records.getBook(editBookId)
                c.records.updateBookInfo(editBookId, form.copy(isbn = existing?.isbn, coverUrl = existing?.coverUrl))
                onSaved(editBookId)
            } else {
                onSaved(c.records.addBook(form).id)
            }
        }
    }
}

/** A06 책 정보 확인 / A07 직접 입력·수정 / A08 책을 찾지 못했어요 / A10 이미 책장에 있어요 / B05 책 정보 편집 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BookFormScreen(
    isbn: String?,
    editBookId: String?,
    onBack: () -> Unit,
    onSaved: (String) -> Unit,
    onOpenExisting: (String) -> Unit,
) {
    val vm = appViewModel(key = "form-$isbn-$editBookId") { BookFormViewModel(it, isbn, editBookId) }

    vm.duplicate?.let { book ->
        AlertDialog(
            onDismissRequest = onBack,
            title = { Text("이미 책장에 있어요") },
            text = { Text("「${book.title}」은(는) 이미 등록한 책이에요. 기존 책으로 이동할게요.") },
            confirmButton = { TextButton(onClick = { onOpenExisting(book.id) }) { Text("기존 책 보기") } },
            dismissButton = { TextButton(onClick = onBack) { Text("닫기") } },
        )
    }

    DokScreen(
        title = when {
            vm.isEdit -> "책 정보 편집"
            isbn != null -> "책 정보 확인"
            else -> "직접 입력"
        },
        onBack = onBack,
        subtitle = "제목, 저자, 전체 쪽수, 장르는 필수예요.",
    ) {
        if (vm.loading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.width(20.dp).height(20.dp), strokeWidth = 2.dp, color = Dok.Moss)
                Spacer(Modifier.width(10.dp))
                Text("책 정보를 찾는 중이에요…", style = MaterialTheme.typography.bodySmall, color = Dok.Muted)
            }
            return@DokScreen
        }
        vm.notice?.let { InfoBanner(it) }
        if (isbn != null) {
            DokCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BookCover(
                        BookEntity("", isbn, vm.title, vm.author, null, 1, "", vm.coverUrl, vm.status, 0, 0, null, createdAt = 0, updatedAt = 0),
                    )
                    Spacer(Modifier.width(14.dp))
                    Text("ISBN $isbn", style = MaterialTheme.typography.labelMedium, color = Dok.Muted)
                }
            }
        }
        LabeledField("책 제목", vm.title, { vm.title = it }, error = vm.titleError, maxLength = 200)
        LabeledField("저자", vm.author, { vm.author = it }, error = vm.authorError, maxLength = 100)
        LabeledField("출판사 (선택)", vm.publisher, { vm.publisher = it }, maxLength = 100)
        LabeledField("전체 쪽수", vm.totalPages, { vm.totalPages = it.filter(Char::isDigit) }, error = vm.pagesError, number = true)

        Text("대표 장르", style = MaterialTheme.typography.labelMedium, color = Dok.Muted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Genres.ALL.forEach { g -> ChoiceChip(g, vm.genre == g, { vm.genre = g }) }
        }
        vm.genreError?.let { Text(it, color = Dok.Error, style = MaterialTheme.typography.bodySmall) }

        if (!vm.isEdit) {
            Text("책장 칸", style = MaterialTheme.typography.labelMedium, color = Dok.Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(BookStatus.READING, BookStatus.WANT).forEach { s ->
                    ChoiceChip(s.label(), vm.status == s, { vm.status = s }, Modifier.weight(1f))
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        PrimaryButton(if (vm.isEdit) "수정 내용 저장" else "책장에 추가하기", { vm.save(onSaved) }, loading = vm.saving)
    }
}
