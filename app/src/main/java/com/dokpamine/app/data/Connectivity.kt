package com.dokpamine.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/** NFR-06: 오프라인이면 외부 조회·공개 글·좋아요를 실행하지 않고 즉시 안내하기 위한 연결 상태. */
class Connectivity(context: Context) {
    private val manager = context.getSystemService(ConnectivityManager::class.java)

    fun isOnline(): Boolean = manager.getNetworkCapabilities(manager.activeNetwork)
        ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

    val online: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(isOnline()) }
            override fun onLost(network: Network) { trySend(isOnline()) }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { trySend(isOnline()) }
        }
        trySend(isOnline())
        manager.registerDefaultNetworkCallback(callback)
        awaitClose { manager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}

const val OFFLINE_MESSAGE = "인터넷에 연결되어 있지 않아요. 연결 후 다시 시도해 주세요."
