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
package app.privacysafe

import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.ConnectivityManager
import android.os.Binder
import android.os.IBinder
import android.util.Log
import android.webkit.WebResourceResponse
import android.webkit.WebView
import app.privacysafe.jsengine.AppGUIComponent
import app.privacysafe.jsengine.JSRunner
import app.privacysafe.jsengine.caps.CloseActivityOp
import app.privacysafe.jsengine.caps.ExitAllOp
import app.privacysafe.jsengine.caps.FocusActivityOp
import app.privacysafe.jsengine.caps.OpenExternalFn
import app.privacysafe.jsengine.caps.ScanUrlQR
import app.privacysafe.jsengine.caps.ShowSystemErrorBoxOp
import app.privacysafe.jsengine.caps.StartActivityOp
import app.privacysafe.jsengine.caps.StartJSEngineComponentOp
import app.privacysafe.jsengine.ops.MakePortForWS
import app.privacysafe.webview.GetAppResource
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.FileNotFoundException
import kotlin.system.exitProcess
import androidx.core.net.toUri
import kotlin.time.Duration.Companion.milliseconds

class CoreRunnerService : Service() {

	private lateinit var jsrunner: JSRunner

	private var srvForInit: BinderForInit? = null
	private var loggedUserId: String? = null
	private var deferredLogin: CompletableDeferred<Unit?>? = null
	private var nonSystemAppToOpenWhenLoggedIn: String? = null
	private lateinit var notifications: Notifications

	val connectivityIndicator = ConnectivityIndicator()

	override fun onCreate() {
		super.onCreate()
		notifications = Notifications(this)
		connectivityIndicator.initialize(getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager)
		val mainNotification = notifications.makeMainNotification(loggedUserId)
		startForeground(mainNotification.first, mainNotification.second)
		initJSRunnerAndWirePostLogin()
	}

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
		removeNotRunningAppTasks()
		// service with core is a backbone of everything, hence it must run
		return START_STICKY
	}

	private fun initJSRunnerAndWirePostLogin() {
		deferredLogin = CompletableDeferred()
		jsrunner = JSRunner(this, FnsForCoreInJS(), notifications)
		jsrunner.scope.launch {
			try {
				loggedUserId = jsrunner.whenUserSignedIn()
				this@CoreRunnerService.deferredLogin?.complete(null)
				this@CoreRunnerService.deferredLogin = null
				notifications.publishMainNotification(loggedUserId)
				val appToOpen = nonSystemAppToOpenWhenLoggedIn
				nonSystemAppToOpenWhenLoggedIn = null
				if (appToOpen != null) {
					jsrunner.scope.launch {
						delay(100.milliseconds)
						this@CoreRunnerService.start3NWebAppGUIComponent(appToOpen)
					}
				}
			} catch (err: Throwable) {
				this@CoreRunnerService.deferredLogin?.completeExceptionally(err)
				notifications.removeAll()
			}
		}
	}

	private fun removeNotRunningAppTasks() {
		getActivityManager().appTasks
			.filter { t -> !t.taskInfo.isRunning }
			.forEach { t ->
				t.finishAndRemoveTask()
			}
	}

	override fun onBind(intent: Intent): IBinder {
		return when (customActionIn(intent)) {

			// service for init is created when started activity binds
			BIND_FOR_INIT_ACTION -> {
				val existing = srvForInit
				if (existing != null) {
					existing.closeActivity()
					srvForInit = null
				}
				srvForInit = BinderForInit()
				srvForInit!!
			}

			BIND_FOR_3NWEB_APP_ACTION -> {
				BinderFor3NWebApp()
			}

			else -> {
				throw Error("Unexpected action for binding: ${intent.action}")
			}
		}
	}

	override fun onDestroy() {
		jsrunner.shutdown()
		super.onDestroy()
	}

	fun openLauncher() {
		if (!jsrunner.findAndFocusOpenAppInstance(Bundled.launcherDomain)) {
			start3NWebAppGUIComponent(Bundled.launcherDomain)
		}
	}

	private fun notificationTriggered(notificationId: Int) {
		jsrunner.scope.launch {
			delay(200.milliseconds)
			notifications.removeAppNotification(notificationId)

			// TODO
			jsrunner.notificationClicked(notificationId)

		}
	}

	/**
	 * Binding to service for initial non-app screen/activity
	 */
	inner class BinderForInit () : Binder() {

		val isUserLoggedIn: Boolean get() = (loggedUserId != null)

		lateinit var closeActivity: () -> Unit

		suspend fun whenJSRunnerInitialized() {
			return jsrunner.whenInitialized()
		}

		fun exit() {
			stopSelf()
		}

		fun setUICallbacks(
			close: () -> Unit
		) {
			closeActivity = close
		}

		fun processURL(url: String) {
			jsrunner.processURL(url)
		}

		fun openLauncher() {
			this@CoreRunnerService.openLauncher()
		}

		fun startLogin(urlToProcess: String?) {
			val startupUrlHash = if (urlToProcess == null) { null } else {
				jsrunner.processURLBeforeLogin(urlToProcess)
			}
			// this implicitly is a call to core to start login.
			startStartupApp(startupUrlHash)
		}

	}

	/**
	 * Binding to service for 3NWeb activity.
	 */
	inner class BinderFor3NWebApp : Binder() {

		val isUserLoggedIn: Boolean get() = (loggedUserId != null)

		suspend fun awaitLoginInProgress() {
			deferredLogin?.await()
		}

		suspend fun getConnectorToCore(appDomain: String, connectorId: String?, entrypoint: String?): UIComponent? {
			return if (connectorId == null) {
				jsrunner.whenInitialized()
				val component = jsrunner.launchAppFromAndroid(appDomain)
				if (component == null) {
					null
				} else {
					UIComponent(component)
				}
			} else if (entrypoint == null) {
				throw Error("Memorized connector id $connectorId should come with expected entrypoint, but it isn't given")
			} else {
				val connector = jsrunner.getAppGUIComponent(connectorId)
				// connector can be null when connectorId value comes from some other logged in period via history
				UIComponent(connector ?: jsrunner.launchAppFromAndroid(appDomain)!!)
			}
		}

		fun notificationClicked(notificationId: Int) {
			notificationTriggered(notificationId)
		}

		fun openLauncher() {
			this@CoreRunnerService.openLauncher()
		}

		fun loginAndOpenApp(appDomain: String) {
			if ((appDomain != Bundled.startupDomain) && (appDomain != Bundled.launcherDomain)) {
				nonSystemAppToOpenWhenLoggedIn = appDomain
			}
			start3NWebAppGUIComponent(Bundled.startupDomain)
		}

		fun findAndFocusOpenAppInstance(appDomain: String, notificationId: Int?): Boolean {
			val found = jsrunner.findAndFocusOpenAppInstance(appDomain)
			if (found && (notificationId != null) && (appDomain == Bundled.launcherDomain)) {
				notificationTriggered(notificationId)
			}
			return found
		}

	}

	inner class FnsForCoreInJS {

		val indicator = connectivityIndicator

		val startAndroidActivity: StartActivityOp = { connectorId, appDomain, entrypoint ->
			jsrunner.makeAppGUIComponent(connectorId, appDomain, entrypoint)

			// TODO these should be based on app manifest
			val requiredPermissions = if (appDomain == Bundled.chatDomain) {
				arrayListOf(Permission.RECORD_AUDIO, Permission.CAMERA)
			} else { null }

			start3NWebAppGUIComponent(connectorId, appDomain, entrypoint, requiredPermissions)
		}

		val closeActivity: CloseActivityOp = { connectorId ->
			when (connectorId) {
				INIT_CONNECTOR_ID -> {
					srvForInit?.closeActivity()
					srvForInit = null
				}
				else -> {
					jsrunner.getAppGUIComponent(connectorId)?.closeActivity()
				}
			}
		}

		val focusActivity: FocusActivityOp = { connectorId ->
			jsrunner.getAppGUIComponent(connectorId)?.focusActivity()
		}

		val showSystemErrorBox: ShowSystemErrorBoxOp = { title, content ->
			startSystemDialogTask(applicationContext, title, content)
		}

		val exitAll: ExitAllOp = {
			stopSelf()
			exitProcess(0)
		}

		val startJSEngineComponent: StartJSEngineComponentOp = { connectorId, appDomain, entrypoint ->
			jsrunner.startDenoComponent(connectorId, appDomain, entrypoint)
		}

		val makePortForWS: MakePortForWS = { socketId ->
			jsrunner.makePortForWS(socketId)
		}

		val openExternal: OpenExternalFn = { url ->
			val browserIntent = Intent(Intent.ACTION_VIEW, url.toUri())
			browserIntent.addFlags((Intent.FLAG_ACTIVITY_NEW_TASK))
			startActivity(browserIntent)
		}

		val scanUrlQR: ScanUrlQR = { prefixies ->

			// XXX add intent call that returns result

			Log.d("w3n", "\n Scanner should open and run now \n")

			startQRScanner(applicationContext)
			"w3n://privacysafe/signup/yq4j-xtfa-d3af-app-me"
//			null
		}

	}

	inner class UIComponent(
		private val component: AppGUIComponent
	) {
		val appDomain = component.appDomain
		val entrypoint = component.entrypoint
		val connectorId = component.connectorId

		private val preloadUrl = if (component.appDomain == Bundled.startupDomain) {
			Bundled.Path.startupPreloadUrl
		} else {
			Bundled.Path.preloadUrl
		}

		/**
		 * This attaches WebView gui to component's connector, returning a loading function.
		 */
		suspend fun attachGUI(gui: WebView, urlHash: String?): () -> Unit {
			val appResources = makeAppResources()
			return component.attachGUI(gui, appResources, urlHash)
		}

		fun setActive(isActive: Boolean) {
			component.setActive(isActive)
		}

		fun disconnect() {
			component.disconnect()
		}

		private suspend fun makeAppResources(): GetAppResource {
			return if (jsrunner.isBundledApp(appDomain)) {
				bundledAppResources()
			} else {
				appResourcesFromCore()
			}
		}

		private fun appResourcesFromCore(): GetAppResource {
			val preloadPath = "${Bundled.Path.webviewPreload}$preloadUrl"
			return { path ->
				val mimeType = mimeFromFileExt(path)
				try {
					val data = jsrunner.readBytesFromAppCodeFS(connectorId, path)
					WebResourceResponse(mimeType, null, data)
				} catch (_: FileNotFoundException) {
					if (path == preloadUrl) {
						WebResourceResponse(mimeType, null, assets.open(preloadPath))
					} else {
						WebResourceResponse(null, null, null)
					}
				}
			}
		}

		private fun bundledAppResources(): GetAppResource {
			val appDir = "${Bundled.Path.apps}/${appDomain.reverseDomain()}"
			val lst = assets.list(appDir)
			if (lst.isNullOrEmpty()) {
				throw Error("No bundled app $appDomain -- missing $appDir in assets")
			}
			val appResourcesDir = "$appDir/app"
			val preloadPath = "${Bundled.Path.webviewPreload}$preloadUrl"
			return { path ->
				val mimeType = mimeFromFileExt(path)
				try {
					val data = assets.open("$appResourcesDir$path")
					WebResourceResponse(mimeType, null, data)
				} catch (_: FileNotFoundException) {
					if (path == preloadUrl) {
						WebResourceResponse(mimeType, null, assets.open(preloadPath))
					} else {
						WebResourceResponse(null, null, null)
					}
				}
			}
		}

		fun setUICallbacks(
			close: () -> Unit,
			focus: () -> Unit
		) {
			component.setUICallbacks(close, focus)
		}

		fun notificationClicked(notificationId: Int) {
			notificationTriggered(notificationId)
		}

	}

}

typealias FnsForCoreInJS = CoreRunnerService.FnsForCoreInJS

private const val INIT_CONNECTOR_ID = "init"

private const val START_CORE_BY_INIT_ACTION = "start-core-by-init"
const val START_CORE_ON_BOOT_ACTION = "start-core-on-boot"

/**
 * Main service runs all ipc flows, core and headless js processes. This should just run always.
 * Hence, it is started with startForegroundService(), and service must call its startForeground() to keep on
 * running.
 */
fun Context.startCoreRunnerService(action: String) {
	val intent = Intent(this, CoreRunnerService::class.java)
		.setAction(customIntentAction(action))
	this.startForegroundService(intent)
}


private fun <T : Binder> Context.bindCoreService(
	onDisconnect: ((name: ComponentName?) -> Unit)?,
	setupIntent: (intent: Intent) -> Unit
): Pair<ServiceConnection, Deferred<T>> {
	val deferred = CompletableDeferred<T>()
	val srvConn = object : ServiceConnection {
		override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
			@Suppress("UNCHECKED_CAST")
			deferred.complete(service as T)
		}
		override fun onServiceDisconnected(name: ComponentName?) {
			if (onDisconnect != null) {
				onDisconnect(name)
			}
		}
	}
	val intent = Intent(this, CoreRunnerService::class.java)
	setupIntent(intent)
	this.bindService(intent, srvConn, 0)
	return Pair(srvConn, deferred)
}

private const val BIND_FOR_INIT_ACTION = "core-for-init"
typealias CoreInit = CoreRunnerService.BinderForInit

fun InitActivity.startAndBindCoreService(): Pair<ServiceConnection, Deferred<CoreInit>> {
	startCoreRunnerService(START_CORE_BY_INIT_ACTION)
	return bindCoreService({ finishAndRemoveTask() }) { intent ->
		intent.action = customIntentAction(BIND_FOR_INIT_ACTION)
	}
}

private const val BIND_FOR_3NWEB_APP_ACTION = "core-for-3nweb-app"
const val APP_DOMAIN = "app-domain"

typealias BinderFor3NWebApp = CoreRunnerService.BinderFor3NWebApp
typealias UIComponent = CoreRunnerService.UIComponent

fun GenericAppActivity.bindCoreService(appDomain: String): Pair<ServiceConnection, Deferred<BinderFor3NWebApp>> {
	return bindCoreService({ finishAndRemoveTask() }) { intent ->
		intent.setAction(customIntentAction(BIND_FOR_3NWEB_APP_ACTION))
			.putExtra(APP_DOMAIN, appDomain)
	}
}

