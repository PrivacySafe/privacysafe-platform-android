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
package app.privacysafe.jsengine.ops

import android.util.Log
import app.privacysafe.jsengine.InjectedAsyncHandler
import app.privacysafe.jsengine.PortIntoJSEngine
import app.privacysafe.jsengine.ops.RequestFn.Header
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.concurrent.atomics.AtomicInt
import kotlin.concurrent.atomics.ExperimentalAtomicApi


class RequestFn : InjectedAsyncHandler(
	"http_request"
) {

	val client = OkHttpClient.Builder().build()

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray? {
		val req = ProtoBuf.decodeFromByteArray<RequestArgs>(argsBytes)
//		Log.d("w3n", "=>> requesting ${req.url}")
		val resp = sendRequest(buildRequest(req))
//		Log.d("w3n", "=>> ${req.url} return ${resp.code}")
		return ProtoBuf.encodeToByteArray(Reply(
			resp.code,
			resp.headers.filterRequested(req.responseHeaders),
			resp.body.bytes()
		))
	}

	private fun buildRequest(opts: RequestArgs): Request {
		val (
			method, url, responseType, sessionId, requestHeaders, responseHeaders, timeout, timeoutRetries,
			contentType, body
		) = opts
		val reqBuilder = Request.Builder()
			.url(url)
			.method(
				method,
				when (method) {
					"POST", "PUT" -> body.toRequestBody(contentType?.toMediaTypeOrNull())
					else -> null
				}
			)
		opts.requestHeaders?.forEach { h ->
			reqBuilder.addHeader(h.name, h.value)
		}
		opts.sessionId?.let {
			reqBuilder.addHeader(SESSION_ID_HEADER, it)
		}
		return reqBuilder.build()
	}

	private suspend fun sendRequest(req: Request): Response {
		val resp = CompletableDeferred<Response>()
		val call = client.newCall(req)
		call.enqueue(object : Callback {
			override fun onFailure(call: Call, e: IOException) {

				// XXX we want to map java exceptions into respective connection exception(s) on js side

				resp.completeExceptionally(e)
			}
			override fun onResponse(call: Call, response: Response) {
				resp.complete(response)
			}
		})
		return resp.await()
	}

	@Serializable
	data class Header(val name: String, val value: String)

	@Serializable
	data class RequestArgs(
		val method: String,
		val url: String,
		val responseType: String?,
		val sessionId: String?,
		val requestHeaders: Array<Header>?,
		val responseHeaders: Array<String>?,
		val timeout: Long?,
		val timeoutRetries: Int?,
		val contentType: String?,
		val body: ByteArray
	)

	@Serializable
	data class Reply(
		val status: Int,
		val headers: Array<Header>?,
		val body: ByteArray
	)

}

private fun Headers.filterRequested(responseHeaders: Array<String>?): Array<Header>? {
	if (responseHeaders == null) {
		return null
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

private val SESSION_ID_HEADER = "X-Session-Id"

// TODO https://bugfender.com/blog/android-websockets/ with example of
typealias MakePortForWS = (socketId: Int) -> PortIntoJSEngine

@OptIn(ExperimentalAtomicApi::class)
class WebSockets (
	private val makePortForWS: MakePortForWS
) {
	private val client: OkHttpClient = OkHttpClient.Builder()
		.pingInterval(30, TimeUnit.SECONDS)
		.build()
	private val sockets = ConcurrentHashMap<Int, WS>()
	private var sCount = AtomicInt(0)

	suspend fun openNew(url: String, sessionId: String): Pair<Int, Int> {
		var socketId = sCount.addAndFetch(1)
		while (sockets[socketId] != null) {
			socketId = sCount.addAndFetch(1)
		}
		val deferred = CompletableDeferred<Unit?>()
		val ws = WS(socketId, url, sessionId, client, makePortForWS(socketId)) { deferred.complete(null) }
		deferred.await()
		sockets[ws.socketId] = ws
		return Pair(200, ws.socketId)
	}

	fun find(sid: Int): WS? {
		return sockets[sid]
	}

	fun remove(ws: WS) {
		if (sockets[ws.socketId] == ws) {
			sockets.remove(ws.socketId)
		}
	}

}

class WS(
	val socketId: Int,
	url: String,
	sessionId: String,
	client: OkHttpClient,
	private val port: PortIntoJSEngine,
	onOpen: () -> Unit
) {
	private val socket: WebSocket

	init {
		val req = Request.Builder()
			.url(url)
			.addHeader(SESSION_ID_HEADER, sessionId)
			.build()
		socket = client.newWebSocket(req, object : WebSocketListener() {

			override fun onOpen(webSocket: WebSocket, response: Response) {
				port.connectTo { msg -> socket.send(String(msg)) }
				onOpen()
			}

			override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
				port.sendIntoJS(bytes.toByteArray())
			}

			override fun onMessage(webSocket: WebSocket, text: String) {
				port.sendIntoJS(text.toByteArray())
			}

			override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
				super.onFailure(webSocket, t, response)
			}

			override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
				super.onClosing(webSocket, code, reason)
			}

		})
		socket.request()
	}

}

class OpenWebSocketFn(
	private val sockets: WebSockets
) : InjectedAsyncHandler("ws_open") {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray? {
		val (url, sessionId) = ProtoBuf.decodeFromByteArray<OpenWSArgs>(argsBytes)
		val (status, socketId) = sockets.openNew(url, sessionId)
		return ProtoBuf.encodeToByteArray(WSOpeningReply(status, socketId))
	}

	@Serializable
	data class OpenWSArgs(val url: String, val sessionId: String)

	@Serializable
	data class WSOpeningReply(val status: Int, val socketId: Int)

}
