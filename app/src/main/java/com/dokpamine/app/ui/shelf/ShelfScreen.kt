package com.dokpamine.app.ui.shelf

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dokpamine.app.data.local.BookEntity
import com.dokpamine.app.data.local.BookStatus
import com.dokpamine.app.ui.appViewModel
import com.dokpamine.app.ui.components.BookCard
import com.dokpamine.app.ui.components.ChoiceChip
import com.dokpamine.app.ui.components.DokScreen
import com.dokpamine.app.ui.components.EmptyState
import com.dokpamine.app.ui.components.OutlineButton
import com.dokpamine.app.ui.components.label
import androidx.lifecycle.ViewModel
import com.dokpamine.app.AppContainer

class ShelfViewModel(c: AppContainer) : ViewModel() {
    val books = c.records.observeBooks()
}

/** S01 읽는 중 / S02 다 읽음 / S03 읽고 싶은 책 (FR-04) */
@Composable
fun ShelfScreen(onAddBook: () -> Unit, onOpenBook: (String) -> Unit) {
    val vm = appViewModel { ShelfViewModel(it) }
    val books by vm.books.collectAsStateWithLifecycle(initialValue = emptyList<BookEntity>())
    var filter by rememberSaveable { mutableStateOf(BookStatus.READING) }
    val filtered = books.filter { it.status == filter }

    DokScreen(title = "나만의 책장", subtitle = "읽은 만큼, 나답게 채워져요.") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(BookStatus.READING, BookStatus.DONE, BookStatus.WANT).forEach { status ->
                ChoiceChip(
                    text = "${status.label()} ${books.count { it.status == status }}",
                    selected = filter == status,
                    onClick = { filter = status },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (books.isEmpty()) {
            EmptyState("책장이 비어 있어요", "첫 책을 등록하면 이곳에 꽂혀요. 바코드를 찍거나 직접 입력할 수 있어요.")
        } else if (filtered.isEmpty()) {
            EmptyState("${filter.label()} 책이 없어요", "다른 칸을 확인하거나 새 책을 등록해 보세요.")
        }
        filtered.forEach { book ->
            BookCard(
                book,
                onClick = { onOpenBook(book.id) },
                trailing = if (book.status == BookStatus.DONE) "${book.author} · 완독 ${book.completedCount}회" else null,
            )
        }
        OutlineButton("새로운 책 등록", onAddBook)
    }
}
