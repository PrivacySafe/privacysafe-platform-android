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

import app.privacysafe.SESSION_ID_HEADER
import app.privacysafe.jsengine.InjectedAsyncHandler
import app.privacysafe.WebSockets
import app.privacysafe.jsengine.InjectedSyncHandler
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
import okio.IOException


class RequestFn : InjectedAsyncHandler(
	"http_request"
) {

	// TODO this is same client for all "net" clients in core, which may leak stuff, and won't work with
	//      simultaneous connectivity to different networks.
	//      We also want a concept of netClientId, that gets released when js' side client does its close().
	//      Methods will also use netClientId.
	val client = OkHttpClient.Builder().build()

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray {
		val req = ProtoBuf.decodeFromByteArray<RequestArgs>(argsBytes)
		val resp = sendRequest(buildRequest(req))
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

class OpenWebSocketFn(
	private val sockets: WebSockets
) : InjectedAsyncHandler("ws_open") {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray {
		val (url, sessionId) = ProtoBuf.decodeFromByteArray<OpenWSArgs>(argsBytes)
		val (status, socketId) = sockets.openNew(url, sessionId)
		return ProtoBuf.encodeToByteArray(WSOpeningReply(status, socketId))
	}

	@Serializable
	data class OpenWSArgs(val url: String, val sessionId: String)

	@Serializable
	data class WSOpeningReply(val status: Int, val socketId: Int?)

}

class CallWebSocketFn(
	private val sockets: WebSockets
) : InjectedSyncHandler(
	"ws_call"
) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray {
		val (socketId, cmd, msg) = ProtoBuf.decodeFromByteArray<RequestArgs>(argsBytes)
		if (!sockets.exists(socketId)) {
			return ProtoBuf.encodeToByteArray(Reply(SOCKET_NOT_FOUND_WS_STATUS))
		}
		when (cmd) {
			SEND_MSG_WS_CMD -> sockets.sendMsg(socketId, msg!!)
			PING_WS_CMD -> sockets.ping(socketId)
			CLOSE_WS_CMD -> sockets.closeWS(socketId)
			else -> throw Error("Unknown command $cmd for WebSocket")
		}
		return ProtoBuf.encodeToByteArray(Reply(OK_WS_STATUS))
	}

	@Serializable
	data class RequestArgs(val socketId: Int, val cmd: String, val msg: String?)

	@Serializable
	data class Reply(val status: String)

}

private const val OK_WS_STATUS = "ok"
private const val SOCKET_NOT_FOUND_WS_STATUS = "ws-not-found"
private const val SEND_MSG_WS_CMD = "msg"
private const val PING_WS_CMD = "ping"
private const val CLOSE_WS_CMD = "close"

