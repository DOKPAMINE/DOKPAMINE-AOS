package com.dokpamine.app.data

import com.dokpamine.app.data.local.AppDatabase
import com.dokpamine.app.data.remote.DokpamineApi
import com.dokpamine.app.data.remote.LoginRequest
import com.dokpamine.app.data.remote.SignupRequest
import com.dokpamine.app.data.remote.TokenResponse
import com.dokpamine.app.data.remote.UpdateMeRequest
import com.dokpamine.app.data.sync.SyncScheduler
import com.dokpamine.app.data.sync.SyncService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

class AccountRepository(
    private val api: DokpamineApi,
    private val prefs: Preferences,
    private val db: AppDatabase,
    private val syncService: SyncService,
    private val syncScheduler: SyncScheduler,
) {
    val account = prefs.account
    val authExpired = prefs.authExpired

    suspend fun login(email: String, password: String) = onAuthenticated(api.login(LoginRequest(email.trim(), password)))

    suspend fun signup(email: String, password: String, nickname: String) =
        onAuthenticated(api.signup(SignupRequest(email.trim(), password, nickname.trim())))

    private suspend fun onAuthenticated(token: TokenResponse) {
        val previous = prefs.account.first()
        // 다른 계정으로 로그인하면 이전 계정의 로컬 기록이 섞이지 않게 비운다.
        if (previous != null && previous.userId != token.user.id) withContext(Dispatchers.IO) { db.clearAllTables() }
        prefs.saveAccount(
            Account(token.user.id, token.user.email, token.user.nickname, token.user.rankingOptIn, token.accessToken),
        )
        runCatching { syncService.restoreSnapshot() }
        syncScheduler.schedulePeriodic()
        syncScheduler.request()
    }

    suspend fun setRankingOptIn(optIn: Boolean) {
        val me = api.updateMe(UpdateMeRequest(rankingOptIn = optIn))
        prefs.account.first()?.let { prefs.saveAccount(it.copy(rankingOptIn = me.rankingOptIn, nickname = me.nickname)) }
    }

    suspend fun updateNickname(nickname: String) {
        val me = api.updateMe(UpdateMeRequest(nickname = nickname.trim()))
        prefs.account.first()?.let { prefs.saveAccount(it.copy(nickname = me.nickname)) }
    }

    /** 로그아웃하면 개인 화면이 잠기고, 이 기기의 기록도 지운다(서버에는 남아 있다). */
    suspend fun logout() {
        syncScheduler.cancelAll()
        withContext(Dispatchers.IO) { db.clearAllTables() }
        prefs.clearAll()
    }
}
