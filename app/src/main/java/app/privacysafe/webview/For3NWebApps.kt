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
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.core.net.toUri
import androidx.webkit.WebViewClientCompat
import app.privacysafe.jsengine.ListCoreObjPath
import app.privacysafe.jsengine.PortIntoJSEngine

/**
 * w3n should be somehow properly setup. Meanwhile, loading from page works for it, but
 * fetch complains about bad scheme, while with https everything runs as is.
 */
const val W3N_SCHEME = "https"

private fun baseUrlOf(appDomain: String): String {
	return "${W3N_SCHEME}://$appDomain"
}

/**
 * GetAppResource provides "like web server response" to a given path within app's folder.
 */
typealias GetAppResource = (path: String) -> WebResourceResponse

/**
 * Sets up given gui (WebView) to load/use/run resources of a given 3NWeb app.
 * appResources provides "like web server response" to a given path within app's folder.
 * All requests, except under data: scheme get intercepted by this, providing proper control.
 *
 * TODO set gui.webChromeClient to contain permissions/restrictions beyond request directions.
 */
@SuppressLint("SetJavaScriptEnabled")
fun WebView.setup3NWeb(
	appDomain: String, urlTailPart: String, appResources: GetAppResource,
	ipcToCore: PortIntoJSEngine, listCoreObjPath: ListCoreObjPath, closeActivity: () -> Unit
): () -> Unit {
	this.settings.javaScriptEnabled = true
	this.webViewClient = WebViewClientFor3NWebApp(appDomain, appResources)
	IpcIntoWebView(
		this, baseUrlOf(appDomain).toUri(), ipcToCore, listCoreObjPath, closeActivity
	)
	this.webChromeClient = WebChromeClientFor3NWebApp(appDomain)
	return { this.loadUrl("${baseUrlOf(appDomain)}$urlTailPart") }
}

private class WebViewClientFor3NWebApp (
	private val domain: String,
	private val appResources: GetAppResource
) : WebViewClientCompat() {

	override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
		if ((request == null) || (request.url.scheme == "data")) {
			return null
		}
		if ((request.url.scheme != W3N_SCHEME) || (request.url.host != domain) || (request.url.path == null)) {
			return WebResourceResponse(null, null, null)
		}
		return appResources(request.url.path!!)
  }

}

typealias LogLevel = ConsoleMessage.MessageLevel

private class WebChromeClientFor3NWebApp (
	private val domain: String
) : WebChromeClient() {

	override fun onConsoleMessage(msg: ConsoleMessage?): Boolean {
		if (msg == null) {
			return true
		}
		val tag = "w3n://$domain"
		val msgStr = "${msg.message()}\nfrom line ${msg.lineNumber()} in ${msg.sourceId()}"
		when (msg.messageLevel()) {
			LogLevel.ERROR -> Log.e(tag, msgStr)
			LogLevel.DEBUG -> Log.d(tag, msgStr)
			else -> Log.i(tag, msgStr)
		}
		return true
	}

	override fun onPermissionRequest(request: PermissionRequest?) {
		Log.d("w3n", "onPermissionRequest called with ${
			request?.resources?.joinToString(", ", "[ ", " ]")
		}")
		request?.grant(request.resources)
//		super.onPermissionRequest(request)
	}

}


































