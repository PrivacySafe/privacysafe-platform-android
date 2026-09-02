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
import android.content.Context
import android.util.Log
import android.webkit.WebView
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import androidx.javascriptengine.JavaScriptSandbox.JS_FEATURE_MESSAGE_PORTS
import androidx.javascriptengine.JavaScriptSandbox.JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER
import androidx.javascriptengine.JavaScriptSandbox.JS_FEATURE_WASM_COMPILATION
import androidx.javascriptengine.JavaScriptSandbox.JS_FEATURE_ISOLATE_MAX_HEAP_SIZE
import androidx.javascriptengine.JavaScriptSandbox.JS_FEATURE_ISOLATE_TERMINATION
import app.privacysafe.FnsForCoreInJS
import app.privacysafe.execBlocking
import app.privacysafe.jsengine.caps.StartJSEngineComponentOp
import app.privacysafe.jsengine.ops.DisconnectFromCoreOp
import app.privacysafe.jsengine.ops.ListCoreObjPathOp
import app.privacysafe.jsengine.ops.MakePortForWS
import app.privacysafe.readToString
import app.privacysafe.webview.GetAppResource
import app.privacysafe.webview.setup3NWeb
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.io.path.Path

const val NUM_OF_CRYPTOR_THREADS = 4

@SuppressLint("RequiresFeature")
class JSRunner(
	ctx: Context,
	uiFns: FnsForCoreInJS
) {

	/**
	 * At this moment only one JavaScriptSandbox can be created per Android app.
	 * Hence, we have one, and use different isolates for core and headless 3NWeb app components.
	 */
	private lateinit var jsBox: JavaScriptSandbox
	private lateinit var jsHas: JsHas

	private lateinit var core: CoreRunner
	private var whenCoreSet: CompletableDeferred<CoreRunner>? = CompletableDeferred()

	private val assets = ctx.assets
	private val executor = Executors.newCachedThreadPool() as ThreadPoolExecutor

	val scope = CoroutineScope(Dispatchers.Default)

	private val components = Components()

	init {
		executor.execute {
			jsBox = JavaScriptSandbox.createConnectedInstanceAsync(ctx).get()
			jsHas = JsHas(
				jsBox.isFeatureSupported(JS_FEATURE_MESSAGE_PORTS),
				jsBox.isFeatureSupported(JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER),
				jsBox.isFeatureSupported(JS_FEATURE_WASM_COMPILATION),
				jsBox.isFeatureSupported(JS_FEATURE_ISOLATE_MAX_HEAP_SIZE),
				jsBox.isFeatureSupported(JS_FEATURE_ISOLATE_TERMINATION)
			)
			Log.d("w3n", "jsHas is $jsHas")
			val dataDir = ctx.dataDir.absolutePath
			core = CoreRunner(
				makeAndConfigureNewIsolate(jsHas), jsHas,
				makeCoreInjectedFns(uiFns, Path(dataDir), assets, Executors.newFixedThreadPool(NUM_OF_CRYPTOR_THREADS)),
				assets, executor, scope, dataDir
			)
			whenCoreSet!!.complete(core)
			whenCoreSet = null
		}
	}

	private fun makeAndConfigureNewIsolate(jsHas: JsHas): JavaScriptIsolate {
		val params = IsolateStartupParameters()
		params.maxEvaluationReturnSizeBytes = 256*1024*1024;
		params.maxHeapSizeBytes = 1024*1024*1024;
		val js = jsBox.createIsolate(params)
		return js
	}

	fun shutdown() {
		jsBox.close()
		executor.shutdown()
	}

	fun whenUserSignedIn(run: (userId: String) -> Unit) {
		scope.launch {
			whenInitialized()
			val userId = core.coreFns.getSignedUserIdEventually()
			run(userId)
		}
	}

	suspend fun whenInitialized() {
		whenCoreSet?.await()
	}

	suspend fun isBundledApp(appDomain: String): Boolean {
		whenInitialized()
		return core.coreFns.isBundledApp(appDomain)
	}

	fun readBytesFromAppCodeFS(connectorId: String, path: String): InputStream {
		return core.coreFns.streamBytesFromAppCodeFS(connectorId, path)
	}

	val makePortForWS: MakePortForWS get() = core.makePortForWS

	fun makeAppGUIComponent(connectorId: String, appDomain: String, entrypoint: String) {
		components.makeAppGUIComponent(connectorId, appDomain, entrypoint)
	}

	fun getAppGUIComponent(connectorId: String): AppGUIComponent? {
		return components.find(connectorId) as? AppGUIComponent
	}

	suspend fun launchAppFromAndroid(appDomain: String): AppGUIComponent? {
		whenInitialized()
		val (connectorId, entrypoint) = core.coreFns.launchAppFromAndroid(appDomain)
		return if (connectorId == "proceed-to-launcher") {
			null
		} else {
			components.makeAppGUIComponent(connectorId, appDomain, entrypoint)
			getAppGUIComponent(connectorId)!!
		}
	}

	fun processURL(url: String) {
		scope.launch {
			whenInitialized()
			core.coreFns.processURL(url)
		}
	}

	fun processURLBeforeLogin(url: String): String? {
		return scope.execBlocking {
			whenInitialized()
			core.coreFns.processURLBeforeLogin(url)
		}
	}

	abstract inner class ComponentConnector(
		val appDomain: String,
		val entrypoint: String,
		val connectorId: String,
		protected val ipcToCore: PortIntoJSEngine
	) {

		fun listObjPath(objPath: Array<String>): Array<String> {
			return core.coreFns.listObjPathInConnector(connectorId, objPath)
		}

	}

	inner class AppGUIComponentConnector(
		appDomain: String,
		entrypoint: String,
		connectorId: String,
		ipcToCore: PortIntoJSEngine
	) : ComponentConnector(appDomain, entrypoint, connectorId, ipcToCore) {

		private val isUIActive = AtomicBoolean(false)
		private lateinit var closeUI: () -> Unit
		private lateinit var focusUI: () -> Unit

		fun attachGUI(gui: WebView, appResources: GetAppResource, urlHash: String?): () -> Unit {
			val listCoreObjPath: ListCoreObjPath = { pathJSON ->
				listObjPath(pathJSON)
			}
			// TODO pass url chunk after entrypoint, as this is the way to pass parameters to startup app.
			//      Yet, this isn't a way for commands passing to other apps, cause path messes up loading that should
			//      occur from entrypoint, and we don't want to sanitize inputs here, instead for other apps commands
			//      are passed via respective CAP(s).
			val urlTailPart = if (urlHash == null) { entrypoint } else { "$entrypoint#$urlHash" }
			return gui.setup3NWeb(appDomain, urlTailPart, appResources, ipcToCore, listCoreObjPath) { closeUI() }
		}

		fun setActive(isActive: Boolean) {
			isUIActive.set(isActive)
		}

		fun setUICallbacks(
			close: () -> Unit,
			focus: () -> Unit
		) {
			closeUI = close
			focusUI = focus
		}

		fun disconnect() {
			if (components.remove(this)) {
				core.coreFns.onComponentClosedInAndroid(connectorId)
				ipcToCore.close()
				closeActivity()
			}
		}

		fun closeActivity() {
			if (this::closeUI.isInitialized) {
				closeUI()
			}
		}
		fun focusActivity() {
			if (this::focusUI.isInitialized) {
				focusUI()
			}
		}

	}

	val startDenoComponent: StartJSEngineComponentOp = { connectorId, appDomain, entrypoint ->
		components.makeAndStartAppDenoComponent(connectorId, appDomain, entrypoint)
	}

	inner class AppComponentConnector (
		appDomain: String,
		entrypoint: String,
		connectorId: String,
		ipcToCore: PortIntoJSEngine,
		makeComponentRunner: (fnsForApp: FnsForAppInJS) -> AppComponentRunner
	) : ComponentConnector(appDomain, entrypoint, connectorId, ipcToCore) {

		val componentRunner = makeComponentRunner(this.FnsForAppInJS())

		fun disconnectAndStopJSEngine() {
			if (components.remove(this)) {
				core.coreFns.onComponentClosedInAndroid(connectorId)
				ipcToCore.close()
				componentRunner.js.close()
			}
		}

		inner class FnsForAppInJS {

			val listCoreObjPathOp: ListCoreObjPathOp = { objPath ->
				listObjPath(objPath)
			}

			val disconnectFromCoreOp: DisconnectFromCoreOp = {
				executor.execute {
					disconnectAndStopJSEngine()
				}
			}

		}

	}

	private inner class Components {

		private val byIds = ConcurrentHashMap<String, ComponentConnector>()

		fun find(connectorId: String): ComponentConnector? {
			return byIds.get(connectorId)
		}

		fun findFromApp(appDomain: String): List<ComponentConnector>? {
			val found = mutableListOf<ComponentConnector>()
			byIds.forEach { _, c ->
				if (c.appDomain == appDomain) {
					found.add(c)
				}
			}
			return if (found.isEmpty()) { null } else { found }
		}

		private fun ensureUniqueIdAndMakeIpcToCore(connectorId: String): PortIntoJSEngine {
			val ipcToCore = core.makePort("c-$connectorId")
			core.coreFns.attachComponentPortToConnector(connectorId)
			return ipcToCore
		}

		/**
		 * This is for core to add
		 */
		fun makeAndStartAppDenoComponent(connectorId: String, appDomain: String, entrypoint: String) {
			val ipcToCore = ensureUniqueIdAndMakeIpcToCore(connectorId)
			val deno = AppComponentConnector(appDomain, entrypoint, connectorId, ipcToCore) { fnsForApp ->
				Log.d("w3n", "Will start jsengine isolate for $appDomain$entrypoint")
				AppComponentRunner(
					appDomain, entrypoint,
					readBytesFromAppCodeFS(connectorId, entrypoint).readToString(),
					jsBox.createIsolate(), jsHas, executor, scope, assets,
					makeAppInjectedFns(fnsForApp),
					ipcToCore
				)
			}
			byIds[connectorId] = deno
			deno.componentRunner.start()
		}

		fun remove(connector: AppComponentConnector): Boolean {
			return byIds.remove(connector.connectorId, connector)
		}

		fun remove(connector: AppGUIComponentConnector): Boolean {
			return byIds.remove(connector.connectorId, connector)
		}

		fun makeAppGUIComponent(connectorId: String, appDomain: String, entrypoint: String) {
			val ipcToCore = ensureUniqueIdAndMakeIpcToCore(connectorId)
			val gui = AppGUIComponentConnector(appDomain, entrypoint, connectorId, ipcToCore)
			byIds[connectorId] = gui
		}

	}

}

typealias ListCoreObjPath = (objPath: Array<String>) -> Array<String>

typealias FnsForAppInJS = JSRunner.AppComponentConnector.FnsForAppInJS

typealias AppGUIComponent = JSRunner.AppGUIComponentConnector
