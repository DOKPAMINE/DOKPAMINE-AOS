package com.dokpamine.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Face
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.dokpamine.app.DokpamineApp
import com.dokpamine.app.ui.auth.AuthScreen
import com.dokpamine.app.ui.book.AddBookScreen
import com.dokpamine.app.ui.book.BookDetailScreen
import com.dokpamine.app.ui.book.BookFormScreen
import com.dokpamine.app.ui.book.ScanScreen
import com.dokpamine.app.ui.calendar.CalendarScreen
import com.dokpamine.app.ui.calendar.StatsScreen
import com.dokpamine.app.ui.home.HomeScreen
import com.dokpamine.app.ui.lounge.FeedDetailScreen
import com.dokpamine.app.ui.lounge.LoungeScreen
import com.dokpamine.app.ui.my.MyScreen
import com.dokpamine.app.ui.notes.NotesScreen
import com.dokpamine.app.ui.shelf.ShelfScreen
import com.dokpamine.app.ui.theme.Dok
import com.dokpamine.app.ui.timer.RecordPageScreen
import com.dokpamine.app.ui.timer.TimerScreen
import kotlinx.coroutines.flow.StateFlow

private data class Tab(val route: Any, val label: String, val icon: ImageVector)

// PRD 4. 정보 구조: 하단 탭 5개, 홈이 가운데.
private val tabs = listOf(
    Tab(Route.Shelf, "책장", Icons.AutoMirrored.Outlined.List),
    Tab(Route.Calendar, "캘린더", Icons.Outlined.DateRange),
    Tab(Route.Home, "홈", Icons.Outlined.Home),
    Tab(Route.Lounge, "라운지", Icons.Outlined.Face),
    Tab(Route.My, "마이", Icons.Outlined.Person),
)

@Composable
fun DokpamineRoot(openTimerRequests: StateFlow<Int>) {
    val container = (LocalContext.current.applicationContext as DokpamineApp).container
    val account by container.accounts.account.collectAsStateWithLifecycle(initialValue = LOADING)
    when (account) {
        LOADING -> Box(Modifier.fillMaxSize())
        null -> AuthScreen()
        else -> MainNav(openTimerRequests)
    }
}

private val LOADING = com.dokpamine.app.data.Account("", "", "", false, "")

@Composable
private fun MainNav(openTimerRequests: StateFlow<Int>) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showBottomBar = tabs.any { tab -> destination?.hasRoute(tab.route::class) == true }

    val openTimer by openTimerRequests.collectAsStateWithLifecycle()
    LaunchedEffect(openTimer) {
        if (openTimer > 0) nav.navigate(Route.Timer) { launchSingleTop = true }
    }

    Scaffold(
        containerColor = Dok.Paper,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = Dok.Surface) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = destination?.hasRoute(tab.route::class) == true,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = Dok.Lime, selectedIconColor = Dok.Ink),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = Route.Home, modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            val back: () -> Unit = { nav.popBackStack() }
            val openBook: (String) -> Unit = { nav.navigate(Route.BookDetail(it)) }

            composable<Route.Home> {
                HomeScreen(
                    onAddBook = { nav.navigate(Route.AddBook) },
                    onOpenBook = openBook,
                    onOpenTimer = { nav.navigate(Route.Timer) },
                )
            }
            composable<Route.Shelf> { ShelfScreen(onAddBook = { nav.navigate(Route.AddBook) }, onOpenBook = openBook) }
            composable<Route.Calendar> { CalendarScreen(onOpenStats = { nav.navigate(Route.Stats) }, onOpenBook = openBook) }
            composable<Route.Lounge> { LoungeScreen(onOpenPost = { nav.navigate(Route.FeedDetail(it)) }) }
            composable<Route.My> { MyScreen() }

            composable<Route.AddBook> {
                AddBookScreen(
                    onBack = back,
                    onScan = { nav.navigate(Route.Scan) },
                    onManual = { nav.navigate(Route.BookForm()) },
                    onIsbn = { nav.navigate(Route.BookForm(isbn = it)) },
                )
            }
            composable<Route.Scan> {
                ScanScreen(
                    onBack = back,
                    onScanned = { isbn -> nav.navigate(Route.BookForm(isbn = isbn)) { popUpTo<Route.Scan> { inclusive = true } } },
                    onManual = { isbn -> nav.navigate(Route.BookForm(isbn = isbn)) { popUpTo<Route.Scan> { inclusive = true } } },
                )
            }
            composable<Route.BookForm> { entry ->
                val route = entry.toRoute<Route.BookForm>()
                BookFormScreen(
                    isbn = route.isbn,
                    editBookId = route.editBookId,
                    onBack = back,
                    onSaved = { bookId ->
                        if (route.editBookId != null) {
                            nav.popBackStack()
                        } else {
                            nav.navigate(Route.BookDetail(bookId)) { popUpTo<Route.AddBook> { inclusive = true } }
                        }
                    },
                    onOpenExisting = { bookId ->
                        nav.navigate(Route.BookDetail(bookId)) { popUpTo<Route.AddBook> { inclusive = true } }
                    },
                )
            }
            composable<Route.BookDetail> { entry ->
                val bookId = entry.toRoute<Route.BookDetail>().bookId
                BookDetailScreen(
                    bookId = bookId,
                    onBack = back,
                    onEdit = { nav.navigate(Route.BookForm(editBookId = bookId)) },
                    onNotes = { nav.navigate(Route.Notes(bookId)) },
                    onOpenTimer = { nav.navigate(Route.Timer) },
                )
            }
            composable<Route.Timer> {
                TimerScreen(
                    onBack = back,
                    onFinished = { nav.navigate(Route.RecordPage) { popUpTo<Route.Timer> { inclusive = true } } },
                    onIdle = { nav.popBackStack() },
                )
            }
            composable<Route.RecordPage> { RecordPageScreen(onBack = back, onSaved = { nav.popBackStack() }) }
            composable<Route.Notes> { entry -> NotesScreen(bookId = entry.toRoute<Route.Notes>().bookId, onBack = back) }
            composable<Route.Stats> { StatsScreen(onBack = back) }
            composable<Route.FeedDetail> { entry -> FeedDetailScreen(reviewId = entry.toRoute<Route.FeedDetail>().reviewId, onBack = back) }
        }
    }
}
