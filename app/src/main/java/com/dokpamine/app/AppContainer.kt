package com.dokpamine.app

import android.content.Context
import com.dokpamine.app.data.AccountRepository
import com.dokpamine.app.data.Connectivity
import com.dokpamine.app.data.Preferences
import com.dokpamine.app.data.RecordRepository
import com.dokpamine.app.data.TimerManager
import com.dokpamine.app.data.local.AppDatabase
import com.dokpamine.app.data.remote.DokpamineApi
import com.dokpamine.app.data.sync.SyncScheduler
import com.dokpamine.app.data.sync.SyncService

/** 수동 DI 컨테이너. 화면의 ViewModel 은 여기서 의존성을 꺼내 쓴다. */
class AppContainer(context: Context) {
    val preferences = Preferences(context)
    val database = AppDatabase.create(context)
    val api = DokpamineApi.create { preferences.cachedToken }
    val connectivity = Connectivity(context)
    val syncScheduler = SyncScheduler(context)
    val syncService = SyncService(database, api, preferences)
    val records = RecordRepository(database, syncScheduler)
    val accounts = AccountRepository(api, preferences, database, syncService, syncScheduler)
    val timer = TimerManager(context, preferences)
}
