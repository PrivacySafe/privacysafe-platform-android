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

import app.privacysafe.jsengine.CallsIntoCore
import kotlinx.coroutines.CompletableDeferred
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.concurrent.atomics.AtomicInt
import kotlin.concurrent.atomics.ExperimentalAtomicApi

private const val CLIENT_SIDE_PING_PERIOD_SECS: Long = 10;

@OptIn(ExperimentalAtomicApi::class)
class WebSockets (
	private val coreFns: () -> CallsIntoCore
) {
	private val client: OkHttpClient = OkHttpClient.Builder()
		.pingInterval(CLIENT_SIDE_PING_PERIOD_SECS, TimeUnit.SECONDS)
//		TODO with proxies, we can move this out into separate networks file to provide networks setup,
//		     more so, it should probably be some function to give client based on url and/or netClientId?
//		.proxy()
		.build()
	private val sockets = ConcurrentHashMap<Int, WebSocket>()
	private var sCount = AtomicInt(0)

	suspend fun openNew(url: String, sessionId: String): Pair<Int, Int?> {
		val socketId = getNextSocketId()
		try {
			val (nonOkStatus, socket) = openSocket(url, sessionId, socketId)
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

	private suspend fun openSocket(url: String, sessionId: String, socketId: Int): Pair<Int?, WebSocket?> {
		var deferredStart: CompletableDeferred<Int?>? = CompletableDeferred()
		val req = Request.Builder()
			.url(url)
			.addHeader(SESSION_ID_HEADER, sessionId)
			.build()
		val socket = client.newWebSocket(req, object : WebSocketListener() {

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

