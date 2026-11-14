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

import app.privacysafe.GetNetClient
import app.privacysafe.RequestOpts
import app.privacysafe.jsengine.InjectedAsyncHandler
import app.privacysafe.WebSockets
import app.privacysafe.jsengine.InjectedSyncHandler
import app.privacysafe.sendRequest
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf


class RequestFn(
	private val getNetClient: GetNetClient
) : InjectedAsyncHandler(
	"http_request"
) {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray {
		val (netId, opts) = ProtoBuf.decodeFromByteArray<RequestArgs>(argsBytes)
		val resp = getNetClient(netId, opts.url).sendRequest(opts)
		return ProtoBuf.encodeToByteArray(resp)
	}

	@Serializable
	data class RequestArgs(val netId: String, val opts: RequestOpts)

}

class OpenWebSocketFn(
	private val sockets: WebSockets
) : InjectedAsyncHandler("ws_open") {

	@OptIn(ExperimentalSerializationApi::class)
	override suspend fun call(argsBytes: ByteArray): ByteArray {
		val (netId, url, sessionId) = ProtoBuf.decodeFromByteArray<OpenWSArgs>(argsBytes)
		val (status, socketId) = sockets.openNew(netId, url, sessionId)
		return ProtoBuf.encodeToByteArray(WSOpeningReply(status, socketId))
	}

	@Serializable
	data class OpenWSArgs(val netId: String, val url: String, val sessionId: String)

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

