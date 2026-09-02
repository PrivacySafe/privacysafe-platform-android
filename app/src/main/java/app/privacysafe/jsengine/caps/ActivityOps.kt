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
package app.privacysafe.jsengine.caps

import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.protobuf.ProtoBuf

typealias StartActivityOp = (connectorId: String, appDomain: String, entrypoint: String) -> Unit

class UIStartAppActivity (
	private val fn: StartActivityOp
) : InjectedSyncHandler("ui_startAppActivity") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (
			connectorId, appDomain, entrypoint
		) = ProtoBuf.decodeFromByteArray<ComponentEntrypointArgs>(argsBytes)
		fn(connectorId, appDomain, entrypoint)
		return null
	}

	@Serializable
	data class ComponentEntrypointArgs(val connectorId: String, val appDomain: String, val entrypoint: String)

}

typealias CloseActivityOp = (connectorId: String) -> Unit

class UICloseAppActivity (
	private val fn: CloseActivityOp
) : InjectedSyncHandler("ui_closeAppActivity") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (connectorId) = ProtoBuf.decodeFromByteArray<ConnectorIdArgs>(argsBytes)
		fn(connectorId)
		return null
	}

	@Serializable
	data class ConnectorIdArgs(val connectorId: String)

}

typealias FocusActivityOp = (connectorId: String) -> Unit

class UIFocusAppActivity (
	private val fn: FocusActivityOp
) : InjectedSyncHandler("ui_focusAppActivity") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (connectorId) = ProtoBuf.decodeFromByteArray<ConnectorIdArgs>(argsBytes)
		fn(connectorId)
		return null
	}

	@Serializable
	data class ConnectorIdArgs(val connectorId: String)

}

typealias ShowSystemErrorBoxOp = (title: String, content: String) -> Unit

class ShowSystemErrorMsgBox (
	private val fn: ShowSystemErrorBoxOp
) : InjectedSyncHandler("ui_showSystemErrorBox") {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (title, content) = ProtoBuf.decodeFromByteArray<SystemErrBoxArgs>(argsBytes)
		fn(title, content)
		return null
	}

	@Serializable
	data class SystemErrBoxArgs(val title: String, val content: String)

}

typealias ExitAllOp = () -> Unit

class ExitAll (
	private val fn: ExitAllOp
) : InjectedSyncHandler("ui_exitAll") {

	override fun call(argsBytes: ByteArray): ByteArray? {
		fn()
		return null
	}

}
