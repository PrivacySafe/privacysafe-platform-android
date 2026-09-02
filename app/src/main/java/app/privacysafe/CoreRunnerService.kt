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

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Binder
import android.os.IBinder
import android.util.Log
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.core.app.NotificationCompat
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

class CoreRunnerService : Service() {

	private lateinit var jsrunner: JSRunner

	private var srvForInit: BinderForInit? = null
	private var loggedUserId: String? = null
	private var deferredLogin: CompletableDeferred<Unit?>? = null
	private var nonSystemAppToOpenWhenLoggedIn: String? = null
	private lateinit var notifications: NotificationManager

	val connectivityIndicator = ConnectivityIndicator()

	override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {

		if (!this::notifications.isInitialized) {
			notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
			connectivityIndicator.initialize(getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager)
		}
		if (!this::jsrunner.isInitialized) {
			startForeground(1, makeNewNotification())
			jsrunner = JSRunner(applicationContext, FnsForCoreInJS())
			Log.d("w3n", "jsrunner starts listening for user login")
			this.deferredLogin = CompletableDeferred()
			jsrunner.whenUserSignedIn { userId ->
				Log.d("w3n", "jsrunner detects login of $userId")
				loggedUserId = userId
				this.deferredLogin?.complete(null)
				this.deferredLogin = null
				notifications.notify(1, makeNewNotification())
				val appToOpen = nonSystemAppToOpenWhenLoggedIn
				nonSystemAppToOpenWhenLoggedIn = null
				if (appToOpen != null) {
					jsrunner.scope.launch {
						delay(100)
						start3NWebAppGUIComponent(applicationContext, appToOpen)
					}
				}
			}
		} else {
			if (loggedUserId == null) {
				notifications.notify(1, makeNewNotification())
			} else {
				notifications.notify(1, makeNewNotification())
			}
		}
		// service with core is a backbone of everything, hence it must run
		return START_STICKY
	}

	private fun makeNewNotification(): Notification {
		val notifBuild = NotificationCompat.Builder(this, CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID)
			.setSmallIcon(R.drawable.app_logo)
			.setContentTitle(resources.getString(R.string.app_name))
			.setPriority(NotificationCompat.PRIORITY_LOW)
			if (loggedUserId == null) {
				notifBuild
					.setContentText("Tap to Login")
					.setContentIntent(intentToOpenStartUpFromNotification(applicationContext))
			} else {
				notifBuild
					.setContentText(loggedUserId)
					.setContentIntent(intentToOpenDashboardFromNotification(applicationContext))
			}
		return notifBuild.build()
	}

	override fun onBind(intent: Intent): IBinder {
		return when (intent.action) {

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

	/**
	 * Binding to service for initial non-app screen/activity
	 */
	inner class BinderForInit () : Binder() {

		val isUserLoggedIn: Boolean get() = (loggedUserId != null)

		lateinit var closeActivity: () -> Unit

		fun setUICallbacks(
			close: () -> Unit
		) {
			closeActivity = close
		}

		fun processURL(url: String) {
			jsrunner.processURL(url)
		}

		fun openLauncher() {
			start3NWebAppGUIComponentInPlatformTask(applicationContext, Bundled.launcherDomain)
		}

		fun startLogin(urlToProcess: String?) {
			val startupUrlHash = if (urlToProcess == null) { null } else {
				jsrunner.processURLBeforeLogin(urlToProcess)
			}
			// this implicitly is a call to core to start login.
			start3NWebAppStartupGUIComponentInPlatformTask(applicationContext, startupUrlHash)
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
				return UIComponent(connector ?: jsrunner.launchAppFromAndroid(appDomain)!!)
			}
		}

		fun openLauncher() {
			start3NWebAppGUIComponentInPlatformTask(applicationContext, Bundled.launcherDomain)
		}

		fun loginAndOpenApp(appDomain: String) {
			assert((appDomain != Bundled.startupDomain) && (appDomain != Bundled.launcherDomain))
			nonSystemAppToOpenWhenLoggedIn = appDomain
			start3NWebAppGUIComponentInPlatformTask(applicationContext, Bundled.startupDomain)
		}

	}

	inner class FnsForCoreInJS {

		val indicator = connectivityIndicator

		val startAndroidActivity: StartActivityOp = { connectorId, appDomain, entrypoint ->
			jsrunner.makeAppGUIComponent(connectorId, appDomain, entrypoint)
			if (appShouldStartInPlatformActivity(appDomain)) {
				start3NWebAppGUIComponentInPlatformTask(applicationContext, connectorId, appDomain, entrypoint)
			} else {
				start3NWebAppGUIComponent(applicationContext, connectorId, appDomain, entrypoint)
			}
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
			// TODO should we remove notifications, as it gets restarted after process closing
			//  - should we do cleaner closing: ask all nicely, and then do rough exit
			exitProcess(0)
		}

		val startJSEngineComponent: StartJSEngineComponentOp = { connectorId, appDomain, entrypoint ->
			jsrunner.startDenoComponent(connectorId, appDomain, entrypoint)
		}

		val makePortForWS: MakePortForWS = { socketId ->
			jsrunner.makePortForWS(socketId)
		}

		val openExternal: OpenExternalFn = { url ->
			val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
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
			if ((lst == null) || lst.isEmpty()) {
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

	}

}

typealias FnsForCoreInJS = CoreRunnerService.FnsForCoreInJS

private const val INIT_CONNECTOR_ID = "init"

private const val START_CORE_ACTION = "init-core-start"

/**
 * Main service runs all ipc flows, core and headless js processes. This should just run always.
 * Hence, it is started with startForegroundService(), and service must call its startForeground() to keep on
 * running.
 */
fun startCoreRunnerService(ctx: Context) {
	val intent = Intent(ctx, CoreRunnerService::class.java)
		.setAction(START_CORE_ACTION)
	ctx.startForegroundService(intent)
}

private fun <T : Binder> bindCoreService(
	ctx: Context,
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
	val intent = Intent(ctx, CoreRunnerService::class.java)
	setupIntent(intent)
	ctx.bindService(intent, srvConn, 0)
	return Pair(srvConn, deferred)
}

private const val BIND_FOR_INIT_ACTION = "core-for-init"
typealias CoreInit = CoreRunnerService.BinderForInit

fun bindCoreServiceForInit(
	ctx: Context, onDisconnect: ((name: ComponentName?) -> Unit)? = null
): Pair<ServiceConnection, Deferred<CoreInit>> {
	return bindCoreService(ctx, onDisconnect) { intent ->
		intent.action = BIND_FOR_INIT_ACTION
	}
}


private const val BIND_FOR_3NWEB_APP_ACTION = "core-for-3nweb-app"
const val APP_DOMAIN = "app-domain"

typealias BinderFor3NWebApp = CoreRunnerService.BinderFor3NWebApp
typealias UIComponent = CoreRunnerService.UIComponent

fun bindCoreServiceFor3NWebApp(
	ctx: Context, appDomain: String, onDisconnect: ((name: ComponentName?)	-> Unit)
): Pair<ServiceConnection, Deferred<BinderFor3NWebApp>> {
	return bindCoreService(ctx, onDisconnect) { intent ->
		intent.setAction(BIND_FOR_3NWEB_APP_ACTION)
			.putExtra(APP_DOMAIN, appDomain)
	}
}

private const val CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID = "core-runner"

fun addCoreRunnerNotificationChannelTo(ctx: Context, notifications: NotificationManager) {
	if (notifications.getNotificationChannel(CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID) != null) {
		return
	}
	val coreChannel = NotificationChannel(
		CORE_RUNNER_NOTIFICATIONS_CHANNEL_ID,
		ctx.getString(R.string.core_runner_channel),
		NotificationManager.IMPORTANCE_LOW
	)
	coreChannel.description = ctx.getString(R.string.core_runner_channel_description)
	coreChannel.setShowBadge(false)
	notifications.createNotificationChannel(coreChannel)
}

fun appShouldStartInPlatformActivity(appDomain: String): Boolean {
	return (appDomain == Bundled.startupDomain) || (appDomain == Bundled.launcherDomain)
}

class ConnectivityIndicator(
) : ConnectivityManager.NetworkCallback() {

	private lateinit var mng: ConnectivityManager

	private var availableNetwork: Network? = null

	fun initialize(m: ConnectivityManager) {
		mng = m
		m.registerDefaultNetworkCallback(this)
	}

	fun hasAvailableNetwork(): Boolean {
		return (availableNetwork != null)
	}

	override fun onAvailable(network: Network) {
		availableNetwork = network
	}

	override fun onLost(network: Network) {
		availableNetwork = null
	}

}
















































