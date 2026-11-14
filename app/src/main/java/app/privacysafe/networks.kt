/*
 Copyright (C) 2026 3NSoft Inc.

 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.

 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/
package app.privacysafe

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.os.IBinder
import androidx.core.content.ContextCompat
import app.privacysafe.jsengine.CallsIntoCore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import net.freehaven.tor.control.TorControlCommands
import net.freehaven.tor.control.TorControlConnection
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.IOException
import org.torproject.jni.TorService
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.concurrent.ConcurrentHashMap
import kotlin.String
import kotlin.concurrent.atomics.AtomicInt
import kotlin.concurrent.atomics.ExperimentalAtomicApi
import kotlin.time.Duration.Companion.seconds

fun makeNetworksParts(torProxy: TorProxy, coreFns: () -> CallsIntoCore): Pair<GetNetClient, WebSockets> {

	var regular = makeClientForRegularNetwork()
	var onion: OkHttpClient? = null
	var onionDeferred: CompletableDeferred<OkHttpClient>? = null

	val getNetClient: GetNetClient = suspend { netId, url ->
		when (netId) {
			REGULAR_NET_ID -> regular
			ONION_NET_ID -> {
				if (onion != null) {
					onion!!
				} else if (onionDeferred != null) {
					onionDeferred!!.await()
				} else {
					onionDeferred = CompletableDeferred()
					if (!torProxy.isStarted) {
						torProxy.startService()
						torProxy.whenConnected()
					}
					onion = makeClientProxyingRegularNetwork("localhost", torProxy.socksPort!!)
					onion
				}
			}
			else -> throw Error("$netId is unknown")
		}
	}

	return Pair(getNetClient, WebSockets(coreFns, getNetClient))
}

private const val REGULAR_NET_ID = "dns+ip"
private const val ONION_NET_ID = "onion"

typealias GetNetClient = suspend (netId: String, url: String) -> OkHttpClient

private const val CLIENT_SIDE_PING_PERIOD_SECS: Long = 10;

@OptIn(ExperimentalAtomicApi::class)
class WebSockets (
	private val coreFns: () -> CallsIntoCore,
	private val getNetClient: GetNetClient
) {

	private val sockets = ConcurrentHashMap<Int, WebSocket>()
	private var sCount = AtomicInt(0)

	suspend fun openNew(netId: String, url: String, sessionId: String): Pair<Int, Int?> {
		val socketId = getNextSocketId()
		try {
			val (nonOkStatus, socket) = openSocket(netId, url, sessionId, socketId)
			return if (nonOkStatus != null) {
				Pair(nonOkStatus, null)
			} else {
				sockets[socketId] = socket!!
				Pair(200, socketId)
			}
		} catch (t: Throwable) {
			// TODO this should turn into runtime exception
			throw t
		}
	}

	private fun getNextSocketId(): Int {
		var socketId = sCount.addAndFetch(1)
		while ((socketId != 0) && (sockets[socketId] != null)) {
			socketId = sCount.addAndFetch(1)
		}
		return socketId
	}

	private suspend fun openSocket(netId: String, url: String, sessionId: String, socketId: Int): Pair<Int?,
		WebSocket?> {
		var deferredStart: CompletableDeferred<Int?>? = CompletableDeferred()
		val req = Request.Builder()
			.url(url)
			.addHeader(SESSION_ID_HEADER, sessionId)
			.build()
		val socket = getNetClient(netId, url).newWebSocket(req, object : WebSocketListener() {

			override fun onOpen(webSocket: WebSocket, response: Response) {
				deferredStart?.complete(null)
				deferredStart = null
			}

			override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
				coreFns().passMsgInWebSocket(socketId, bytes.utf8())
			}

			override fun onMessage(webSocket: WebSocket, text: String) {
				coreFns().passMsgInWebSocket(socketId, text)
			}

			override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
				if (deferredStart == null) {
					coreFns().signalWebSocketFailed(socketId, t, response)
				} else {
					if ((response == null) || (response.code == 200)) {
						deferredStart!!.completeExceptionally(t)
					} else {
						deferredStart!!.complete(response.code)
					}
					deferredStart = null
				}
			}

			override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
				coreFns().signalWebSocketClosing(socketId, code, reason)
			}

		})
		deferredStart?.await()
		return Pair(null, socket)
	}

	fun exists(socketId: Int): Boolean {
		return sockets.containsKey(socketId)
	}

	fun closeWS(socketId: Int) {
		val ws = sockets.remove(socketId)
		ws?.close(1000, null)
	}

	fun sendMsg(socketId: Int, text: String) {
		val ws = sockets[socketId]
		ws?.send(text)
	}

	fun ping(socketId: Int) {
		if (sockets.containsKey(socketId)) {
			coreFns().pongInWebSocket(socketId)
		}
	}

}

const val SESSION_ID_HEADER = "X-Session-Id"

fun makeClientForRegularNetwork(): OkHttpClient {
	return OkHttpClient.Builder()
		.pingInterval(CLIENT_SIDE_PING_PERIOD_SECS.seconds)
		.build()
}

fun makeClientProxyingRegularNetwork(host: String, port: Int): OkHttpClient {
	return OkHttpClient.Builder()
		.proxy(Proxy(Proxy.Type.SOCKS, InetSocketAddress(host, port)))
		.readTimeout(20.seconds)
		.writeTimeout(20.seconds)
		.connectTimeout(80.seconds)
		.pingInterval(CLIENT_SIDE_PING_PERIOD_SECS.seconds)
		.build()
}

suspend fun OkHttpClient.sendRequest(opts: RequestOpts): Reply {
	val resp = CompletableDeferred<Response>()
	val call = newCall(buildRequest(opts))
	call.enqueue(object : Callback {
		override fun onFailure(call: Call, e: IOException) {

			// XXX we want to map java exceptions into respective connection exception(s) on js side

			resp.completeExceptionally(e)
		}
		override fun onResponse(call: Call, response: Response) {
			resp.complete(response)
		}
	})
	val reply = resp.await()
	return Reply(
		reply.code,
		reply.headers.filterRequested(opts.responseHeaders),
		reply.body.bytes()
	)
}

private fun buildRequest(opts: RequestOpts): Request {
	val (
		method, url, responseType, sessionId, requestHeaders, responseHeaders, timeout, timeoutRetries,
		contentType, body
	) = opts
	val reqBuilder = Request.Builder()
		.url(url)
		.method(
			method,
			when (method) {
				"POST", "PUT" -> (body ?: throw Exception("Missing body in $method request"))
					.toRequestBody(contentType?.toMediaTypeOrNull())
				else -> null
			}
		)
	requestHeaders?.forEach { h ->
		reqBuilder.addHeader(h.name, h.value)
	}
	sessionId?.let {
		reqBuilder.addHeader(SESSION_ID_HEADER, it)
	}
	return reqBuilder.build()
}

@Serializable
data class Header(val name: String, val value: String)

fun Headers.filterRequested(responseHeaders: Array<String>?): Array<Header> {
	if (responseHeaders == null) {
		return arrayOf()
	}
	val filtered = mutableListOf<Header>()
	for (hName in responseHeaders) {
		val hVal = this[hName]
		if (hVal != null) {
			filtered.add(Header(hName, hVal))
		}
	}
	return filtered.toTypedArray()
}

@Serializable
data class RequestOpts(
	val method: String,
	val url: String,
	val responseType: String? = null,
	val sessionId: String? = null,
	val requestHeaders: Array<Header>? = null,
	val responseHeaders: Array<String>? = null,
	val timeout: Long? = null,
	val timeoutRetries: Int? = null,
	val contentType: String? = null,
	val body: ByteArray? = null
)

@Serializable
data class Reply(
	val status: Int,
	val headers: Array<Header>,
	val body: ByteArray
)

class TorProxy(
	private val ctx: Context
) {

	var status: TorStatus? = null
	private val statusAwaiters = mutableMapOf<TorStatus, CompletableDeferred<Unit?>>()
	private var torSrv: TorService.LocalBinder? = null
	private var disconnectSrv: (() -> Unit?)? = null

	init {
		ContextCompat.registerReceiver(
			ctx,
			object : BroadcastReceiver() {
				override fun onReceive(ctx: Context?, intent: Intent?) {
					val statusStr = intent?.extras?.getString(TorService.EXTRA_STATUS)
					when (statusStr) {
						TorService.STATUS_STARTING -> {
							status = TorStatus.STARTING
						}
						TorService.STATUS_ON -> {
							status = TorStatus.ON
						}
						TorService.STATUS_STOPPING -> {
							status = TorStatus.STOPPING
						}
						TorService.STATUS_OFF -> {
							status = TorStatus.OFF
						}
						else -> {
							return
						}
					}
					statusAwaiters.remove(status)?.complete(null)
				}
			},
			IntentFilter(TorService.ACTION_STATUS),
			ContextCompat.RECEIVER_NOT_EXPORTED
		)
	}

	val isStarted: Boolean get() {
		return (disconnectSrv != null)
	}

	suspend fun startService() {
		if (isStarted) {
			return
		}
		val deferred = CompletableDeferred<TorService.LocalBinder>()
		val srvConn = object : ServiceConnection {
			override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
				@Suppress("UNCHECKED_CAST")
				deferred.complete(service as TorService.LocalBinder)
			}
			override fun onServiceDisconnected(name: ComponentName?) {
				torSrv = null
			}
		}
		val intent = Intent(ctx, TorService::class.java)
		ctx.bindService(intent, srvConn, Context.BIND_AUTO_CREATE)
		disconnectSrv = {
			ctx.unbindService(srvConn)
			disconnectSrv = null
		}
		torSrv = deferred.await()
	}

	fun shutdown() {
		torControlConnection?.shutdownTor(TorControlCommands.SIGNAL_SHUTDOWN)
	}

	val torControlConnection: TorControlConnection? get() {
		return torSrv?.service?.torControlConnection
	}

	val socksPort: Int? get() {
		return torSrv?.service?.socksPort
	}

	suspend fun whenStatusIs(status: TorStatus) {
		val current = this.status
		if ((current != null) && (status.ordinal <= current.ordinal)) {
			return
		}
		var deferred = statusAwaiters[status]
		if (deferred == null) {
			deferred = CompletableDeferred()
			statusAwaiters[status] = deferred
		}
		deferred.await()
	}

	suspend fun whenConnected(): Boolean {
		whenStatusIs(TorStatus.ON)
		while (status == TorStatus.ON) {
			val str = torConnStatus ?: return false
			val connected = str.split("\n")
				.filter { s -> s.isNotEmpty() }
				.map { s -> s.endsWith("CONNECTED") }
			val totalConnected = connected.filter { c -> c }.size
			if (totalConnected >= 2) {
				return true
			}
			delay(5.seconds)
		}
		return false
	}

	val torConnStatus: String? get() {
		return torControlConnection?.getInfo("orconn-status")
	}

}

enum class TorStatus {
	STARTING, ON, STOPPING, OFF
}

