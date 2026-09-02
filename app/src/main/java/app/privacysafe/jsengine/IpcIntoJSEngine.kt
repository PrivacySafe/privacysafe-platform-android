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
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import androidx.javascriptengine.JavaScriptConsoleCallback.ConsoleMessage
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.Message
import androidx.javascriptengine.TerminationInfo
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebMessagePortCompat.WebMessageCallbackCompat
import androidx.webkit.WebViewFeature
import app.privacysafe.RuntimeException
import app.privacysafe.decodeBase64
import app.privacysafe.makeSequentialIntegerIdGenerator
import app.privacysafe.makeSequentialStringIdGenerator
import app.privacysafe.readToString
import app.privacysafe.toBase64
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.guava.asListenableFuture
import kotlinx.coroutines.launch
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.util.concurrent.CancellationException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.atomic.AtomicBoolean

@SuppressLint("RequiresFeature")
abstract class IpcIntoJSEngine(
	val js: JavaScriptIsolate,
	protected val jsHas: JsHas,
	protected val executor: ThreadPoolExecutor,
	protected val scope: CoroutineScope,
	assets: AssetManager
) {

	private val portMsgsInInfoConsole: ListenerOfPortMsgsInInfoConsole?

	init {
		Log.d("w3n", "IpcIntoJSEngine.init() on freshly created jsengine isolate, p 0")
		val loggingExecutor = Executors.newSingleThreadExecutor()
		val processInfoMsg = if (jsHas.namedPorts) {
			portMsgsInInfoConsole = null
			{ message: ConsoleMessage -> onConsoleInfoMsg(message) }
		} else {
			portMsgsInInfoConsole = ListenerOfPortMsgsInInfoConsole();
			{ message: ConsoleMessage ->
				if (!portMsgsInInfoConsole.consumed(message.message)) {
					onConsoleInfoMsg(message)
				}
			}
		}
		js.setConsoleCallback(loggingExecutor) { message ->
			when (message.level) {
				ConsoleMessage.LEVEL_LOG -> onConsoleLogMsg(message)
				ConsoleMessage.LEVEL_INFO -> processInfoMsg(message)
				ConsoleMessage.LEVEL_ERROR -> onConsoleErrorMsg(message)
				ConsoleMessage.LEVEL_WARNING -> onConsoleWarningMsg(message)
				ConsoleMessage.LEVEL_DEBUG -> onConsoleDebugMsg(message)
			}
		}
		js.addOnTerminatedCallback(loggingExecutor) { info ->
			onTerminated(info)
		}
		Log.d("w3n", "IpcIntoJSEngine.init() on freshly created jsengine isolate, p 1")
		js.loadFrom(assets, Bundled.Path.commonPreload)
		Log.d("w3n", "IpcIntoJSEngine.init() on freshly created jsengine isolate, p 2, done")
	}

	protected open fun onConsoleLogMsg(msg: ConsoleMessage) {}
	protected open fun onConsoleErrorMsg(msg: ConsoleMessage) {}
	protected open fun onConsoleWarningMsg(msg: ConsoleMessage) {}
	protected open fun onConsoleDebugMsg(msg: ConsoleMessage) {}
	protected open fun onConsoleInfoMsg(msg: ConsoleMessage) {}
	protected open fun onTerminated(info: TerminationInfo) {}

	fun makePort(portName: String): PortIntoJSEngine {
		return PortIntoJSEngine(portName) { portName, listener ->
			makeMsgPassingPort(portName, listener)
		}
	}

	protected fun injectFns(vararg fnHandlers: InjectedFn) {
		for (handler in fnHandlers) {
			val fnPort = makePort(handler.portName)
			handler.attachToPortAndStartService(fnPort, scope)
		}
	}

	protected fun makeMsgPassingPort(portName: String, listener: (bytes: ByteArray) -> Unit): MsgPassingPort {
		return if (jsHas.namedPorts) {
			makeProperMsgPort(portName, listener)
		} else if (jsHas.namedData) {
			makeNamedDataPassingPort(portName, listener)
		} else {
			TODO("need implementation with not much help")
		}
	}

	private fun makeProperMsgPort(portName: String, listener: (bytes: ByteArray) -> Unit): MsgPassingPort {
		return object : MsgPassingPort {
			@SuppressLint("RequiresFeature")
			private val port = js.createMessageChannel(portName, executor) { message ->
				when (message.type) {
					Message.TYPE_STRING -> {
						Log.e("w3n", "received a string message in port for calling into js. Message dropped.")
					}
					Message.TYPE_ARRAY_BUFFER -> {
						try {
							listener(message.arrayBuffer)
						} catch (err: Throwable) {
							Log.e("w3n", "exception occurred in processing binary from js in port $portName:\n$err")
						}
					}
				}
			}

			override fun send(bytes: ByteArray) {
				port.postMessage(Message.createArrayBufferMessage(bytes))
			}

			override fun close() {
				port.close()
			}
		}
	}

	@OptIn(ExperimentalSerializationApi::class)
	private fun makeNamedDataPassingPort(portName: String, listener: (bytes: ByteArray) -> Unit): MsgPassingPort {

		portMsgsInInfoConsole!!.addPort(portName, listener)

		return object : MsgPassingPort {

			@SuppressLint("RequiresFeature")
			override fun send(bytes: ByteArray) {
				val dataId = nextDataId()
				try {
					js.provideNamedData(dataId, ProtoBuf.encodeToByteArray(NamedData(portName, bytes)))
					js.evaluateJavaScriptAsync("$consumeNamedJsEvalFn('${dataId}')").get()
				} catch (err: Throwable) {
					Log.e("w3n", "Failed to pass data into $portName port\n${err.message}\n${
						err.stackTrace.joinToString("\n")
					}")
				}
			}

			override fun close() {
				portMsgsInInfoConsole.removePort(portName)
			}

		}
	}

	private inner class ListenerOfPortMsgsInInfoConsole {

		private val portListeners = ConcurrentHashMap<String, (bytes: ByteArray) -> Unit>()

		fun addPort(portName: String, listener: (bytes: ByteArray) -> Unit) {
			if (portListeners.containsKey(portName)) {
				throw Exception("Port $portName already exists")
			}
			portListeners[portName] = listener
		}

		fun removePort(portName: String) {
			portListeners.remove(portName)
		}

		fun consumed(txt: String): Boolean {
			val portName = if (txt.startsWith(markerInConsoleInfo) && txt.endsWith(markerInConsoleInfo)) {
				txt.slice(markerLength..<(txt.length-markerLength))
			} else {
				return false
			}
			val listener = portListeners[portName]
			if (listener == null) {
				return false
			}
			executor.execute {
				val msg = extractNextMsgFromJS(portName)
				if (msg != null) {
					executor.execute {
						try {
							listener(msg)
						} catch (err: Throwable) {
							Log.e("w3n", "Error in processing message from jsengine:\n${err.message}\n${
								err.stackTraceToString()
							}")
						}
					}
				}
			}
			return true
		}

		private fun extractNextMsgFromJS(portName: String): ByteArray? {
			return try {
				val b64 = js.evaluateJavaScriptAsync("$extractMsgJsEvalFn('${portName}')").get()
				if (b64.isEmpty()) {
					null
				} else {
					b64.decodeBase64()
				}
			} catch (err: Throwable) {
				Log.e("w3n", "Fail to extract message from jsengine in port $portName:\n${err.message}\n${
					err.stackTrace.joinToString("\n")
				}")
				null
			}
		}
	}

}

private const val markerInConsoleInfo = "~*~"
private const val markerLength = markerInConsoleInfo.length
private const val consumeNamedJsEvalFn = "_ipc_consume_named"
private const val extractMsgJsEvalFn = "_ipc_extract_msg"

data class JsHas(
	val namedPorts: Boolean, val namedData: Boolean, val wasm: Boolean,
	val isolateTerm: Boolean, val isolateHeap: Boolean
)

class PortIntoJSEngine(
	private val portName: String,
	makeMsgPassingPort: (portName: String, listener: (msg: ByteArray) -> Unit) -> MsgPassingPort
) {
	private lateinit var listener: (msg: ByteArray) -> Unit

	private var webviewMsgThread: HandlerThread? = null

	private val port = makeMsgPassingPort(portName) { msg -> listener(msg) }

	fun sendIntoJS(msg: ByteArray) {
		port.send(msg)
	}

	private fun ensureCanConnect() {
		if (this::listener.isInitialized) {
			throw Exception("Port is already connected")
		}
		if (webviewMsgThread != null) {
			throw Exception("webviewMsgThread is already set")
		}
	}

	fun connectTo(port: PortIntoJSEngine) {
		ensureCanConnect()
		listener = { msg ->  port.sendIntoJS(msg) }
		port.listener = { msg -> sendIntoJS(msg) }
	}

	fun connectTo(msgListener: (msg: ByteArray) -> Unit) {
		ensureCanConnect()
		listener = msgListener
	}

	@SuppressLint("RequiresFeature")
	fun connectTo(port: WebMessagePortCompat) {
		ensureCanConnect()
		webviewMsgThread = HandlerThread("$portName from webview into core")
		webviewMsgThread!!.start()
		val canSendBytes = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)
		port.setWebMessageCallback(
			Handler(webviewMsgThread!!.looper),
			if (canSendBytes) {
				object : WebMessageCallbackCompat() {
					override fun onMessage(port: WebMessagePortCompat, message: WebMessageCompat?) {
						if ((message != null) && (message.type == WebMessageCompat.TYPE_ARRAY_BUFFER)) {
							sendIntoJS(message.arrayBuffer)
						}
					}
				}
			} else {
				object : WebMessageCallbackCompat() {
					override fun onMessage(port: WebMessagePortCompat, message: WebMessageCompat?) {
						if ((message != null) && (message.type == WebMessageCompat.TYPE_STRING)) {
							sendIntoJS(message.data!!.decodeBase64())
						}
					}
				}
			}
		)
		listener = if (canSendBytes) {
			{ msg -> port.postMessage(WebMessageCompat(msg)) }
		} else {
			{ msg -> port.postMessage(WebMessageCompat(msg.toBase64())) }
		}
	}

	fun close() {
		webviewMsgThread?.quit()
		port.close()
	}

}

interface MsgPassingPort {
	fun send(bytes: ByteArray)
	fun close()
}

private val nextDataId = makeSequentialStringIdGenerator()

@Serializable
data class NamedData(val portName: String, val data: ByteArray)

abstract class CommonProtoBufs {

	@Serializable
	data class BooleanValue(val value: Boolean)

	@Serializable
	data class IntValue(val value: Int)

	@Serializable
	data class StringArrayValue(val values: Array<String>)

	@Serializable
	data class StringListValue(val values: List<String>)

	@Serializable
	data class StringValue(val value: String)

}

private const val FNS_FOR_ANDROID_PORT_NAME = "fns-for-android"

@OptIn(ExperimentalSerializationApi::class)
abstract class CallsIntoJS(
	makeMsgPassingPort: (portName: String, listener: (msg: ByteArray) -> Unit) -> MsgPassingPort
) : CommonProtoBufs() {
	private val newCallId = makeSequentialIntegerIdGenerator()
	private val deferredCalls = ConcurrentHashMap<Int, CompletableDeferred<ByteArray>>()

	private var jsSignaledConnected = AtomicBoolean(false)
	val isConnected: Boolean get () = jsSignaledConnected.get()

	protected val port = makeMsgPassingPort(FNS_FOR_ANDROID_PORT_NAME) { msg ->
		try {
			val (
				id, res, err
			) = ProtoBuf.decodeFromByteArray<ReplyWithinCall>(msg)
			val call = deferredCalls.remove(id)
			if (call != null) {
				if ((err == null) || err.isEmpty()) {
					call.complete(res)
				} else {
					call.completeExceptionally(Exception(err))
				}
			}
		} catch (err: Throwable) {
			Log.e("w3n", "exception occurred in processing calls to js:\n${err.message}\n${err.stackTraceToString()}")
		}
	}

	protected suspend inline fun <reified TArgs, reified TRes> callWithReturned(fnName: String, args: TArgs): TRes {
		val (id, call) = makeDeferred()
		val req = ProtoBuf.encodeToByteArray(RequestWithinCallIntoJS(
			id, fnName, ProtoBuf.encodeToByteArray(args)
		))
		port.send(req)
		val rep = call.await()
		return ProtoBuf.decodeFromByteArray<TRes>(rep)
	}

	protected suspend inline fun <reified TRes> callWithReturned(fnName: String): TRes {
		val (id, call) = makeDeferred()
		val req = ProtoBuf.encodeToByteArray(RequestWithinCallIntoJS(id, fnName, ByteArray(0)))
		port.send(req)
		val rep = call.await()
		return ProtoBuf.decodeFromByteArray<TRes>(rep)
	}

	@OptIn(ExperimentalCoroutinesApi::class)
	protected inline fun <reified TArgs> callReturningVoid(fnName: String, args: TArgs) {
		val (id, call) = makeDeferred()
		val req = ProtoBuf.encodeToByteArray(RequestWithinCallIntoJS(
			id, fnName, ProtoBuf.encodeToByteArray(args)
		))
		port.send(req)
		call.asListenableFuture().get()
	}

	protected fun callReturningVoid(fnName: String) {
		val (id, call) = makeDeferred()
		val req = ProtoBuf.encodeToByteArray(RequestWithinCallIntoJS(id, fnName, ByteArray(0)))
		port.send(req)
		call.asListenableFuture().get()
	}

	protected inline fun <reified TArgs> callReturningBytes(fnName: String, args: TArgs): ByteArray {
		val (id, call) = makeDeferred()
		val req = ProtoBuf.encodeToByteArray(
			RequestWithinCallIntoJS(id, fnName, ProtoBuf.encodeToByteArray(args)
		))
		port.send(req)
		return call.asListenableFuture().get()
	}

	protected fun makeDeferred(): Pair<Int, Deferred<ByteArray>> {
		val deferred = CompletableDeferred<ByteArray>()
		var callId = newCallId()
		while (deferredCalls.get(callId) != null) {
			callId = newCallId()
		}
		deferredCalls[callId] = deferred
		return Pair(callId, deferred)
	}

	@Serializable
	data class RequestWithinCallIntoJS(val id: Int, val fnName: String, val args: ByteArray)

	@Serializable
	data class ReplyWithinCall(val id: Int, val res: ByteArray, val err: String?)

}

@OptIn(ExperimentalSerializationApi::class)
abstract class InjectedFn(
	val portName: String,
) : CommonProtoBufs() {

	abstract fun attachToPortAndStartService(fnPort: PortIntoJSEngine, scope: CoroutineScope)

	@Serializable
	data class RequestWithinCallIntoAndroid(val id: Int, val args: ByteArray)

	@Serializable
	data class ReplyWithinCall(val id: Int, val res: ByteArray, val err: String? = null)

}

@OptIn(ExperimentalSerializationApi::class)
abstract class InjectedSyncHandler(
	portName: String
) : InjectedFn(portName) {
	private lateinit var port: PortIntoJSEngine

	protected abstract fun call(argsBytes: ByteArray): ByteArray?

	override fun attachToPortAndStartService(fnPort: PortIntoJSEngine, scope: CoroutineScope) {
		if (this::port.isInitialized) {
			throw Exception("Function has already been attached to $portName port")
		}
		port = fnPort
		port.connectTo { msg ->
			val (id, args) = ProtoBuf.decodeFromByteArray<RequestWithinCallIntoAndroid>(msg)
			val reply = try {
				// PERF in DEBUG
//				val startTS = Clock.System.now().toEpochMilliseconds()

				val res = call(args)

				// DEBUG
//				if (!portName.startsWith("fh_") && !portName.startsWith("fs_")) Log.d("w3n", "$portName returns result to js in ${
//					(Clock.System.now().toEpochMilliseconds() - startTS)} milliseconds"
//				)

				ReplyWithinCall(id, res ?: ByteArray(0))
			} catch (err: RuntimeException) {

				// DEBUG
//				Log.d("w3n", "$portName has runtime error for js:\n${err.toJSON()}")

				ReplyWithinCall(id, ByteArray(0), err.toJSON())
			} catch (err: Throwable) {

				// DEBUG
				Log.e(
					"w3n", "error in processing message in port $portName:\n$err\n${err.message}:\n${
						err.stackTraceToString()
					}"
				)

				ReplyWithinCall(
					id, ByteArray(0),
					"${err.message}:\n${err.stackTrace.joinToString("\n")}"
				)
			}
			port.sendIntoJS(ProtoBuf.encodeToByteArray(reply))
		}
	}
}

@OptIn(ExperimentalSerializationApi::class)
abstract class InjectedAsyncHandler(
	portName: String,
) : InjectedFn(portName) {
	private lateinit var port: PortIntoJSEngine

	protected suspend abstract fun call(argsBytes: ByteArray): ByteArray?

	override fun attachToPortAndStartService(fnPort: PortIntoJSEngine, scope: CoroutineScope) {
		if (this::port.isInitialized) {
			throw Exception("Function has already been attached to $portName port")
		}
		port = fnPort
		port.connectTo { msg ->
			val (id, args) = ProtoBuf.decodeFromByteArray<RequestWithinCallIntoAndroid>(msg)
			scope.launch {

				val reply = try {
					// PERF in DEBUG
//					val startTS = Clock.System.now().toEpochMilliseconds()

					val res = call(args)

					// DEBUG
//					if (portName != "delay") Log.d("w3n", "$portName returns result to js in ${
//							(Clock.System.now().toEpochMilliseconds() - startTS)
//						} milliseconds"
//					)

					ReplyWithinCall(id, res ?: ByteArray(0))
				} catch (err: RuntimeException) {

					// DEBUG
//					Log.d("w3n", "$portName has runtime error for js:\n${err.toJSON()}")

					ReplyWithinCall(id, ByteArray(0), err.toJSON())
				} catch (_: CancellationException) {
					return@launch
				} catch (err: Throwable) {

					// DEBUG
					Log.e(
						"w3n", "error in processing message in port $portName:\n$err\n${err.message}:\n${
							err.stackTraceToString()
						}"
					)

					ReplyWithinCall(
						id, ByteArray(0),
						"${err.message}:\n${err.stackTraceToString()}"
					)
				}
				port.sendIntoJS(ProtoBuf.encodeToByteArray(reply))
			}
		}
	}
}

interface Bundled {
	interface Path {
		companion object {
			const val jsenginePreloads = "scripts-jsengine"
			const val commonPreload = "$jsenginePreloads/common-preload.js"
			const val coreLoad = "$jsenginePreloads/core-load.js"
			const val appPreload = "$jsenginePreloads/app-preload.js"
		}
	}
}

fun JavaScriptIsolate.loadFrom(assets: AssetManager, pathInAssets: String) {
	this.evaluateJavaScriptAsync(assets.open(pathInAssets).readToString()).get()
}
