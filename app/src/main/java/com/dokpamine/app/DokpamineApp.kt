package com.dokpamine.app

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class DokpamineApp : Application() {
    lateinit var container: AppContainer
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        appScope.launch {
            // 토큰을 메모리에 올려 두고, 남아 있는 대기 기록이 있으면 동기화를 예약한다.
            if (container.preferences.account.first() != null) {
                container.syncScheduler.schedulePeriodic()
                container.syncScheduler.request()
            }
        }
    }
}
