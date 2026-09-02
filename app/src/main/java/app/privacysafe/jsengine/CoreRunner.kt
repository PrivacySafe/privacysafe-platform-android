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
package app.privacysafe.jsengine

import android.annotation.SuppressLint
import android.content.res.AssetManager
import android.util.Log
import androidx.javascriptengine.JavaScriptConsoleCallback.ConsoleMessage
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.TerminationInfo
import app.privacysafe.execBlocking
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import java.io.FileNotFoundException
import java.io.InputStream
import java.util.Objects
import java.util.concurrent.ThreadPoolExecutor

@SuppressLint("RequiresFeature")
class CoreRunner(
	js: JavaScriptIsolate,
	jsHas: JsHas,
	injectedFns: Array<InjectedFn>,
	assets: AssetManager,
	executor: ThreadPoolExecutor,
	scope: CoroutineScope,
	dataDir: String
) : IpcIntoJSEngine(js, jsHas, executor, scope, assets) {

	val coreFns = CallsIntoCore() { portName, listener ->
		makeMsgPassingPort(portName, listener)
	}

	init {
		injectFns(*injectedFns)
		js.loadFrom(assets, Bundled.Path.coreLoad)
		coreFns.init(dataDir)
	}

	override fun onConsoleLogMsg(msg: ConsoleMessage) {
		Log.i("w3n-core", msg.message)
	}

	override fun onConsoleInfoMsg(msg: ConsoleMessage) {
		Log.i("w3n-core", msg.message)
	}

	override fun onConsoleWarningMsg(msg: ConsoleMessage) {
		Log.w("w3n-core", msg.message)
	}

	override fun onConsoleDebugMsg(msg: ConsoleMessage) {
		Log.i("w3n-core", msg.message)
	}

	override fun onConsoleErrorMsg(msg: ConsoleMessage) {
		Log.e("w3n-core", msg.message)
	}

	override fun onTerminated(info: TerminationInfo) {
		Log.e("w3n-core", "Termination occurred: ${info.message}")
	}

	val makePortForWS = { socketId: Int ->
		makePort("ws_#$socketId")
	}

}

class CallsIntoCore (
	makeMsgPassingPort: (portName: String, listener: (msg: ByteArray) -> Unit) -> MsgPassingPort
) : CallsIntoJS(makeMsgPassingPort) {
	private val ioScope = CoroutineScope(Dispatchers.IO)

	fun init(dataDir: String) {
		callReturningVoid("init", DataDirArgs(dataDir))
	}

	@Serializable
	data class DataDirArgs(val dataDir: String)

	fun attachComponentPortToConnector(connectorId: String) {
		callReturningVoid("attachComponentPortToConnector", ConnectorIdArgs(connectorId))
	}

	@Serializable
	data class ConnectorIdArgs(val connectorId: String)

	fun onComponentClosedInAndroid(connectorId: String) {
		callReturningVoid("onComponentClosedInAndroid", ConnectorIdArgs(connectorId))
	}

	@OptIn(ExperimentalSerializationApi::class)
	fun listObjPathInConnector(connectorId: String, objPath: Array<String>): Array<String> {
		return ioScope.execBlocking {
			callWithReturned<ConnectorAndObjPathArgs, StringArrayValue>(
				"listObjPathInConnector", ConnectorAndObjPathArgs(connectorId, objPath)
			).values
		}
	}

	@Serializable
	data class ConnectorAndObjPathArgs(val connectorId: String, val objPath: Array<String>)

	@OptIn(ExperimentalSerializationApi::class)
	suspend fun isBundledApp(appDomain: String): Boolean {
		return callWithReturned<AppDomainArgs, BooleanValue>(
			"isBundledApp", AppDomainArgs(appDomain)
		).value
	}

	@Serializable
	data class AppDomainArgs(val appDomain: String)

	suspend fun launchAppFromAndroid(appDomain: String): ConnectorAndEntrypoint {
		return callWithReturned<AppDomainArgs, ConnectorAndEntrypoint>(
			"launchAppFromAndroid", AppDomainArgs(appDomain)
		)
	}

	@Serializable
	data class ConnectorAndEntrypoint(val connectorId: String, val entrypoint: String)

	fun processURL(url: String) {
		callReturningVoid("processURL", UrlArgs(url))
	}

	@Serializable
	data class UrlArgs(val url: String)

	suspend fun processURLBeforeLogin(url: String): String? {
		val hash = callWithReturned<UrlArgs, StringValue>("processURLBeforeLogin", UrlArgs(url)).value
		return hash.ifEmpty { null }
	}

	@OptIn(ExperimentalSerializationApi::class)
	private fun getFileSizeInAppCodeFS(connectorId: String, path: String): Int {
		return ioScope.execBlocking {
			val size = try {
				callWithReturned<ConnectorAndPathArgs, IntValue>(
					"getFileSizeInAppCodeFS",
					ConnectorAndPathArgs(connectorId, path)
				).value
			} catch (err: Throwable) {
				Log.e("w3", "getFileSizeInAppCodeFS call in path $path into app under connector $connectorId threw:\n" +
					"${err.message}\n${err.stackTraceToString()}"
				)
				throw FileNotFoundException("File $path not found in app's code folder")
			}
			if (size < 0) {
				throw FileNotFoundException("File $path not found in app's code folder")
			} else {
				size
			}
		}
	}

	@Serializable
	data class ConnectorAndPathArgs(val connectorId: String, val path: String)

	suspend fun getSignedUserIdEventually(): String {
		return callWithReturned<StringValue>("getSignedUserIdEventually").value
	}

	private fun readBytesFromFileInAppCodeFS(connectorId: String, path: String, start: Int, end: Int): ByteArray? {
		return ioScope.execBlocking {
			callReturningBytes(
				"readBytesFromFileInAppCodeFS",
				FileReadArgs(connectorId, path, start, end)
			)
		}
	}

	@Serializable
	data class FileReadArgs(val connectorId: String, val path: String, val start: Int, val end: Int)

	fun streamBytesFromAppCodeFS(connectorId: String, path: String): InputStream {
		val size = getFileSizeInAppCodeFS(connectorId, path)
		try {
			return StreamFromAppCodeFS(size) { start, end ->
				readBytesFromFileInAppCodeFS(connectorId, path, start, end)
			}
		} catch (err: Throwable) {
			throw FileNotFoundException(err.message)
		}
	}

}

private const val BUFFER_SIZE_TO_READ_CODE = 128*1024

private class StreamFromAppCodeFS(
	private val size: Int,
	private val readBytesFromJS: (start: Int, end: Int) -> ByteArray?,
) : InputStream() {

	private var position: Int = 0
	private var buffer: ByteArray? = null
	private var posInBuf: Int = 0

	private fun readIntoBufferFromJS() {
		buffer = readBytesFromJS(position, position+BUFFER_SIZE_TO_READ_CODE)
	}

	private fun readFromBuffer(b: ByteArray, off: Int, len: Int): Int {
		val chunkLen = (buffer!!.size - posInBuf).coerceAtMost(len)
		buffer!!.copyInto(b, off, posInBuf, posInBuf+chunkLen)
		posInBuf += chunkLen
		if (posInBuf >= buffer!!.size) {
			buffer = null
			posInBuf = 0
		}
		return chunkLen
	}

	override fun read(b: ByteArray?, off: Int, len: Int): Int {
		Objects.checkFromIndexSize(off, len, b!!.size)
		if (position >= size) {
			return -1
		}
		if (this.buffer == null) {
			this.readIntoBufferFromJS()
			if (this.buffer == null) {
				return -1
			}
		}
		val chunkLen = this.readFromBuffer(b, off, len)
		position += chunkLen
		return chunkLen
	}

	override fun skip(n: Long): Long {
		TODO("StreamFromAppCodeFS.skip() not yet implemented")
	}

	override fun read(): Int {
		TODO("StreamFromAppCodeFS.read() not yet implemented")
	}

}
