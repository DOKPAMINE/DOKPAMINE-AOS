package com.dokpamine.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dokpamine.app.AppContainer
import com.dokpamine.app.DokpamineApp
import kotlinx.serialization.Serializable

// 화면 ID 는 Figma 프레임 이름(H01, S01, A03 …)을 따른다.
object Route {
    @Serializable data object Home              // H01
    @Serializable data object Shelf             // S01~S03
    @Serializable data object Calendar          // C01~C03
    @Serializable data object Lounge            // F01, L01
    @Serializable data object My                // P01
    @Serializable data object AddBook           // A01
    @Serializable data object Scan              // A03
    @Serializable data class BookForm(val isbn: String? = null, val editBookId: String? = null) // A06, A07, B05
    @Serializable data class BookDetail(val bookId: String) // B01
    @Serializable data object Timer             // T02~T03
    @Serializable data object RecordPage        // T04~T08
    @Serializable data class Notes(val bookId: String) // R01~R05
    @Serializable data object Stats             // C04
    @Serializable data class FeedDetail(val reviewId: String) // F02
}

/** 수동 DI: AppContainer 에서 의존성을 꺼내 ViewModel 을 만든다. */
@Composable
inline fun <reified VM : ViewModel> appViewModel(key: String? = null, crossinline create: (AppContainer) -> VM): VM {
    val container = (LocalContext.current.applicationContext as DokpamineApp).container
    return viewModel(key = key, factory = viewModelFactory { initializer { create(container) } })
}
