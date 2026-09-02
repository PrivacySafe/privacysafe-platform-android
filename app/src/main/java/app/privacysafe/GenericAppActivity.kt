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

import android.app.ComponentCaller
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicInteger

/**
 * All apps need the same web-gui runtime, provided by this class.
 * But, opening a new task with same class isn't creating new service binding, isn't creating a new activity, and
 * generally messes things up.
 * Hence, we go multi-activity route, with all activity classes being GenericAppActivity in code, and just have
 * name with numbers.
 * We'll need to recycle activity classes.
 */
abstract class GenericAppActivity() : ComponentActivity() {

	protected val scope = CoroutineScope(Dispatchers.Main)

	protected lateinit var core: UIComponent
	protected lateinit var appSrvConn: ServiceConnection

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		setContentView(R.layout.init_layout)
		val appDomain = intent.extras!!.getString(APP_DOMAIN)!!
		val connectorId = intent.extras?.getString(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE)
		val entrypoint = intent.extras?.getString(APP_COMPONENT_ENTRYPOINT)
		val urlHash = intent.extras?.getString(APP_URL_HASH)
		Log.d("w3n", "Opening activity with for $appDomain connector #$connectorId, entrypoint $entrypoint")
		val (conn, coreDef) = bindCoreServiceFor3NWebApp(this, appDomain) { _: ComponentName? ->
			finishAndRemoveTask()
		}
		appSrvConn = conn
		scope.launch {
			val coreSrv = coreDef.await()

			if (coreSrv.isUserLoggedIn) {
				if (appDomain == Bundled.startupDomain) {
					coreSrv.openLauncher()
					finishAndRemoveTask()
					return@launch
				}
			} else if ((appDomain != Bundled.startupDomain) && (appDomain != Bundled.launcherDomain)) {
				coreSrv.loginAndOpenApp(appDomain)
				finishAndRemoveTask()
				return@launch
			}

			try {
				val componentSrv = coreSrv.getConnectorToCore(appDomain, connectorId, entrypoint)
				if (componentSrv == null) {
					coreSrv.awaitLoginInProgress()
					start3NWebAppGUIComponentInPlatformTask(applicationContext, Bundled.launcherDomain)
					finishAndRemoveTask()
					return@launch
				}
				core = componentSrv

				// TODO service method to get dynamically app info from its manifest, name, icon, etc.

				core.setUICallbacks(
					close = { finishAndRemoveTask() },
					focus = {
						start3NWebAppGUIComponent(
							applicationContext, core.connectorId, core.appDomain, core.entrypoint,
							newTask = false
						)
					}
				)
				setContentView(R.layout.w3n_app_layout)
				val gui = findViewById<WebView>(R.id.app_gui)
				bindToAndroidBackButtonTo(gui)
				setupTouchEventsListenerTo(gui)
				gui.settings.mediaPlaybackRequiresUserGesture = false
				val load = core.attachGUI(gui, urlHash)
				load()
				core.setActive(true)
			} catch (err: Throwable) {
				Log.e(
					"w3n",
					"Fail to setup activity for $appDomain:\n${err.message}\n${err.stackTraceToString()}"
				)
				finishAndRemoveTask()
			}
		}
	}

	override fun onNewIntent(intent: Intent, caller: ComponentCaller) {
		if (this::core.isInitialized) {
			Log.d("w3n", "new intent on ${core.appDomain}, connector ${core.connectorId}")
		}
		super.onNewIntent(intent, caller)
	}

	override fun onResume() {
		if (this::core.isInitialized) {
			core.setActive(true)
		}
		super.onResume()
	}

	override fun onPause() {
		if (this::core.isInitialized) {
			core.setActive(false)
		}
		super.onPause()
	}

	override fun onDestroy() {
		if (this::core.isInitialized) {
			core.disconnect()
		}
		if (this::appSrvConn.isInitialized) {
			unbindService(appSrvConn)
		}
		super.onDestroy()
	}

	private fun bindToAndroidBackButtonTo(gui: WebView) {

		onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {

			override fun handleOnBackPressed() {
				if (gui.canGoBack()) {
					gui.goBack()
				} else if (this@GenericAppActivity::core.isInitialized) {
					moveTaskToBack(true)
				}
			}

		})

	}

	private fun setupTouchEventsListenerTo(gui: WebView) {

	}

}

var nextRequestCode = makeSequentialIntegerIdGenerator()

fun intentToOpenStartUpFromNotification(ctx: Context): PendingIntent {
	return PendingIntent.getActivity(
		ctx,
		nextRequestCode(),
		intentToOpenAppInPlatformTask(ctx, null, Bundled.startupDomain, null),
		PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
	)
}

fun intentToOpenDashboardFromNotification(ctx: Context): PendingIntent {
	return PendingIntent.getActivity(
		ctx,
		nextRequestCode(),
		intentToOpenAppInPlatformTask(ctx, null, Bundled.launcherDomain, null),
		PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
	)
}

fun start3NWebAppGUIComponentInPlatformTask(
	ctx: Context, connectorId: String, appDomain: String, entrypoint: String
) {
	ctx.startActivity(intentToOpenAppInPlatformTask(ctx, connectorId, appDomain, entrypoint))
}

fun start3NWebAppGUIComponentInPlatformTask(ctx: Context, appDomain: String) {
	ctx.startActivity(intentToOpenAppInPlatformTask(ctx, null, appDomain, null))
}

const val APP_COMPONENT_ENTRYPOINT = "app-component-entrypoint"
const val CONNECTOR_ID_OF_3NWEB_APP_INSTANCE = "connector-id"
private const val APP_URL_HASH = "app-url-hash"

fun start3NWebAppStartupGUIComponentInPlatformTask(ctx: Context, startupUrlHash: String?) {
	val intent = intentToOpenAppInPlatformTask(ctx, null, Bundled.startupDomain, null)
	if (startupUrlHash != null) {
		intent.putExtra(APP_URL_HASH, startupUrlHash)
	}
	ctx.startActivity(intent)
}

private fun intentToOpenAppInPlatformTask(
	ctx: Context, connectorId: String?, appDomain: String, entrypoint: String?
): Intent {
	if ((connectorId != null) && (entrypoint == null)) {
		throw IllegalArgumentException("App component entrypoint is missing when connector id is given")
	}
	val intent = Intent(ctx, classForApp(appDomain))
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
//		.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
		.setAction(Intent.ACTION_MAIN)
		.putExtra(APP_DOMAIN, appDomain)
	if (connectorId != null) {
		intent
			.putExtra(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE, connectorId)
			.putExtra(APP_COMPONENT_ENTRYPOINT, entrypoint)
	}
	return intent
}

fun start3NWebAppGUIComponent(ctx: Context, appDomain: String) {
	val intent = Intent(ctx, classForApp(appDomain))
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
		.setAction(Intent.ACTION_MAIN)
		.putExtra(APP_DOMAIN, appDomain)
	ctx.startActivity(intent)
}

fun start3NWebAppGUIComponent(
	ctx: Context, connectorId: String, appDomain: String, entrypoint: String, newTask: Boolean = true
) {
	val intent = Intent(ctx, classForApp(appDomain))
		.putExtra(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE, connectorId)
		.putExtra(APP_DOMAIN, appDomain)
		.putExtra(APP_COMPONENT_ENTRYPOINT, entrypoint)
		.setAction(Intent.ACTION_MAIN)
	if (newTask) {
		intent
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
			.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
	} else {
		intent
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
			.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
	}
	ctx.startActivity(intent)
}

private fun classForApp(appDomain: String): Class<out GenericAppActivity> {
	val staticAssignment = when (appDomain) {
		Bundled.startupDomain -> StartupAppActivity::class.java
		Bundled.launcherDomain -> DashboardAppActivity::class.java
		Bundled.contactsDomain -> ContactsAppActivity::class.java
		Bundled.inboxDomain -> InboxAppActivity::class.java
		Bundled.chatDomain -> ChatAppActivity::class.java
		Bundled.storageDomain -> StorageAppActivity::class.java
		Bundled.treasureDomain -> TreasureAppActivity::class.java
		else -> null
	}
	if (staticAssignment != null) {
		return staticAssignment
	}

	// TODO some reading from cached map between user apps and numbered class should be present
	//      we also need to think about main and service components

	val cls = activityClasses[activityCounter.getAndAdd(1)]
	activityCounter.compareAndSet(10, 0)
	return cls
}

private val activityCounter = AtomicInteger(0)

class StartupAppActivity () : GenericAppActivity() {}
class DashboardAppActivity () : GenericAppActivity() {}
class ContactsAppActivity () : GenericAppActivity() {}
class InboxAppActivity () : GenericAppActivity() {}
class ChatAppActivity () : GenericAppActivity() {}
class StorageAppActivity () : GenericAppActivity() {}
class TreasureAppActivity () : GenericAppActivity() {}

class AppActivity1 () : GenericAppActivity() {}
class AppActivity2 () : GenericAppActivity() {}
class AppActivity3 () : GenericAppActivity() {}
class AppActivity4 () : GenericAppActivity() {}
class AppActivity5 () : GenericAppActivity() {}
class AppActivity6 () : GenericAppActivity() {}
class AppActivity7 () : GenericAppActivity() {}
class AppActivity8 () : GenericAppActivity() {}
class AppActivity9 () : GenericAppActivity() {}
class AppActivity10 () : GenericAppActivity() {}


private val activityClasses = arrayOf(
	AppActivity1::class.java,
	AppActivity2::class.java,
	AppActivity3::class.java,
	AppActivity4::class.java,
	AppActivity5::class.java,
	AppActivity6::class.java,
	AppActivity7::class.java,
	AppActivity8::class.java,
	AppActivity9::class.java,
	AppActivity10::class.java,
)
