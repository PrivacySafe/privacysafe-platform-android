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

import android.content.res.AssetManager
import android.util.Log
import androidx.javascriptengine.JavaScriptConsoleCallback.ConsoleMessage
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.TerminationInfo
import kotlinx.coroutines.CoroutineScope
import java.util.concurrent.ThreadPoolExecutor

class AppComponentRunner(
	private val domain: String,
	private val entrypoint: String,
	code: String,
	js: JavaScriptIsolate,
	jsHas: JsHas,
	executor: ThreadPoolExecutor,
	scope: CoroutineScope,
	assets: AssetManager,
	injectedFns: Array<InjectedFn>,
	portIntoCore: PortIntoJSEngine
) : IpcIntoJSEngine(js, jsHas, executor, scope, assets) {

	private var loadAllCode: (() -> Unit)? = null

	init {
		Log.d("w3n", "AppComponentRunner.init() on freshly created jsengine isolate, p 0")
		portIntoCore.connectTo(makePort("core-ipc"))
		Log.d("w3n", "AppComponentRunner.init() on freshly created jsengine isolate, p 1")
		injectFns(*injectedFns)
		Log.d("w3n", "AppComponentRunner.init() on freshly created jsengine isolate, p 2")
		loadAllCode = {
			js.loadFrom(assets, Bundled.Path.appPreload)
			js.evaluateJavaScriptAsync("""(function(){
				const preloadProc = _awaitPreloadInit();
				const loadCode = async () => { ;;;; $code ;;;; };
				(preloadProc ? preloadProc.then(loadCode) : loadCode()).catch(
					err => console.error(`Fail to load component's code:\n`, err.message, '\n', err.stack)
				);
			})();""".trimIndent()).get()
		}
		Log.d("w3n", "AppComponentRunner.init() on freshly created jsengine isolate, p 3, done")
	}

	fun start() {
		val doLoading = loadAllCode ?: throw Error("start procedure has already been called")
		loadAllCode = null
		doLoading()
	}

	override fun onConsoleLogMsg(msg: ConsoleMessage) {
		val tag = "w3n-deno://$domain$entrypoint"
		Log.i(tag, msg.message)
	}

	override fun onConsoleErrorMsg(msg: ConsoleMessage) {
		val tag = "w3n-deno://$domain$entrypoint"
		Log.e(tag, msg.message)
	}

	override fun onTerminated(info: TerminationInfo) {
		val tag = "w3n-deno://$domain$entrypoint"
		Log.e(tag, "Termination occurred: ${info.message}")
	}

}
