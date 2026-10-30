package com.dokpamine.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import kotlinx.coroutines.flow.MutableStateFlow
import com.dokpamine.app.ui.DokpamineRoot
import com.dokpamine.app.ui.theme.DokpamineTheme

class MainActivity : ComponentActivity() {
    /** 타이머 알림을 눌러 들어오면 타이머 화면으로 이동한다. */
    private val openTimerRequests = MutableStateFlow(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        setContent {
            DokpamineTheme {
                DokpamineRoot(openTimerRequests)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_OPEN_TIMER, false) == true) {
            openTimerRequests.value += 1
            intent.removeExtra(EXTRA_OPEN_TIMER)
        }
    }

    companion object {
        const val EXTRA_OPEN_TIMER = "open_timer"
    }
}
