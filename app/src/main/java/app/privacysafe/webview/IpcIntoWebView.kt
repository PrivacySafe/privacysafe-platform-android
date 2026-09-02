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
package app.privacysafe.webview

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebMessagePortCompat.WebMessageCallbackCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.privacysafe.jsengine.ListCoreObjPath
import app.privacysafe.jsengine.PortIntoJSEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.onClosed
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

class IpcIntoWebView(
	private val gui: WebView,
	private val targetOrigin: Uri,
	private val ipcToCore: PortIntoJSEngine,
	private val listCoreObjPath: ListCoreObjPath,
	private val closeActivity: () -> Unit
) {

	private val mainLoop = Handler(Looper.getMainLooper())
	private lateinit var portToJS: WebMessagePortCompat

	val isPortSet get() = this::portToJS.isInitialized

	init {
		gui.addJavascriptInterface(object {
			/**
			 * When JS in WebView is ready to catch message with ipc port in it, JS should call this.
			 * Android side gonna setup internals, prepare port, and send the port.
			 * This process follows standard web messaging port setup.
			 * In contrast, it is a more complicated exchange than setting up named ports in JSEngine (v.1.1.x).
			 */
			@JavascriptInterface
			fun setupPort() {
				injectedSetupPort()
			}

			/**
			 * Note that passing Array/List doesn't work, needing JSON-ification
			 */
			@JavascriptInterface
			fun listObjPath(objPathInJSON: String): String {
				val objPath = Json.Default.decodeFromString<Array<String>>(objPathInJSON)
				return Json.Default.encodeToString(listCoreObjPath(objPath))
			}

			@JavascriptInterface
			fun canSendBuffer(): Boolean {
				return WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)
			}
		}, "_ipc_")
	}

	@SuppressLint("RequiresFeature")
	private fun injectedSetupPort() {
		if (isPortSet) {
			return
		}
		mainLoop.post {
			try {
				val channel = WebViewCompat.createWebMessageChannel(gui)
				portToJS = channel[0]
				ipcToCore.connectTo(portToJS)
				val msgWithPort = WebMessageCompat("", arrayOf(channel[1]))
				WebViewCompat.postWebMessage(gui, msgWithPort, targetOrigin)
			} catch (err: Throwable) {
				Log.e("w3n", "Connecting to core produced error:\n${err.message}\n${err.stackTraceToString()}")
				closeActivity()
			}
		}
	}

}
