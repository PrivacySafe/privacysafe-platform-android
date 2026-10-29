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
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.widget.TextView
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

	protected lateinit var appDomain: String
	protected lateinit var core: UIComponent
	protected lateinit var appSrvConn: ServiceConnection

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		setContentView(R.layout.init_layout)
		appDomain = intent.extras!!.getString(APP_DOMAIN)!!
		if (appDomain == Bundled.startupDomain) {
			setInitScreenText(getString(R.string.init_logging_in))
		} else {
			setInitScreenText("Loading $appDomain ...")
		}
		val (conn, coreDef) = bindCoreService(appDomain)
		appSrvConn = conn
		scope.launch {
			try {
				val coreSrv = coreDef.await()
				if (setup(coreSrv)) {
					core.setActive(true)
				} else {
					finishAndRemoveTask()
				}
			} catch (err: Throwable) {
				Log.e(
					"w3n",
					"Fail to setup activity for $appDomain:\n${err.message}\n${err.stackTraceToString()}"
				)
				finishAndRemoveTask()
			}
		}
	}

	protected open suspend fun setup(coreSrv: BinderFor3NWebApp): Boolean {

		if (!coreSrv.isUserLoggedIn) {
			coreSrv.loginAndOpenApp(appDomain)
			return false
		}

		// TODO
		//  - info about required permissions should be available here
		//  - should manifest, or parameters from it be in intent's extra's?

		val permissionRequester = if (appDomain == Bundled.chatDomain) {
			checkMultiplePermissionsAndRegisterRequesterIfNeeded(
				Permission.RECORD_AUDIO, Permission.CAMERA,
			)
		} else { null }

		if (permissionRequester != null) {
			permissionRequester()
		}

		return if (intent.action == Intent.ACTION_MAIN) {
			// XXX does this ever happen ?
			focusOpenedOrSetupThis(coreSrv)
		} else when (customActionIn(intent)) {
			START_APP_ACTION -> setupAndLoadWithConnectorFromIntent(coreSrv)
			else -> false
		}

	}

	protected suspend fun focusOpenedOrSetupThis(coreSrv: BinderFor3NWebApp): Boolean {
		return !coreSrv.findAndFocusOpenAppInstance(appDomain, null) &&
			setCore(coreSrv, null, null) &&
			setupGuiComponentAndLoad(null)
	}

	protected suspend fun setupAndLoadWithConnectorFromIntent(coreSrv: BinderFor3NWebApp): Boolean {
		val connectorId = intent.extras?.getString(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE)
		val entrypoint = intent.extras?.getString(APP_COMPONENT_ENTRYPOINT)
		return setCore(coreSrv, connectorId, entrypoint) && setupGuiComponentAndLoad(null)
	}

	protected suspend fun setCore(
		coreSrv: BinderFor3NWebApp, connectorId: String?, entrypoint: String?
	): Boolean {
		val componentSrv = coreSrv.getConnectorToCore(appDomain, connectorId, entrypoint)
		if (componentSrv == null) {
			coreSrv.awaitLoginInProgress()
			coreSrv.openLauncher()
			return false
		} else {
			core = componentSrv
			return true
		}
	}

	protected suspend fun setupGuiComponentAndLoad(urlHash: String?): Boolean {

		// TODO service method to get dynamically app info from its manifest, name, icon, etc.

		core.setUICallbacks(
			close = { finishAndRemoveTask() },
			focus = {
				focus3NWebAppGUIComponent(
					core.connectorId, core.appDomain, core.entrypoint,
					this@GenericAppActivity::class.java
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

		return true
	}

	private fun setInitScreenText(txt: String) {
		findViewById<TextView?>(R.id.progressTxt)?.text = txt
	}

	override fun onNewIntent(intent: Intent, caller: ComponentCaller) {
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

class StartupAppActivity () : GenericAppActivity() {
	override suspend fun setup(coreSrv: BinderFor3NWebApp): Boolean {
		return if (coreSrv.isUserLoggedIn) {
			coreSrv.openLauncher()
			false
		} else {
			if (setCore(coreSrv, null, null)) {
				val urlHash = intent.extras?.getString(APP_URL_HASH)
				setupGuiComponentAndLoad(urlHash)
			} else {
				false
			}
		}
	}
	override fun onNewIntent(intent: Intent, caller: ComponentCaller) {}
}

class DashboardAppActivity () : GenericAppActivity() {
	override suspend fun setup(coreSrv: BinderFor3NWebApp): Boolean {

		if (!coreSrv.isUserLoggedIn) {
			coreSrv.loginAndOpenApp(appDomain)
			return false
		}

		return if (intent.action == Intent.ACTION_MAIN) {
			focusOpenedOrSetupThis(coreSrv)
		} else when (customActionIn(intent)) {

			OPEN_APP_NOTIFICATION_ACTION -> {
				val notificationId = intent.extras?.getInt(NOTIFICATION_ID)
				if((notificationId == null) || (notificationId == 0)) {
					return false
				}
				if (coreSrv.findAndFocusOpenAppInstance(appDomain, notificationId)) { return false }
				if (setCore(coreSrv, null, null) && setupGuiComponentAndLoad(null)) {
					coreSrv.notificationClicked(notificationId)
					true
				} else {
					false
				}
			}

			START_APP_ACTION -> {
				setupAndLoadWithConnectorFromIntent(coreSrv)
			}

			else -> {
				false
			}
		}
	}

	override fun onNewIntent(intent: Intent, caller: ComponentCaller) {
		when (customActionIn(intent)) {
			OPEN_APP_NOTIFICATION_ACTION -> {
				val notificationId = intent.extras?.getInt(NOTIFICATION_ID) ?: return
				core.notificationClicked(notificationId)
			}
		}
	}
}

var nextRequestCode = makeSequentialIntegerIdGenerator()

fun CoreRunnerService.intentToOpenStartUpFromNotification(): PendingIntent {
	return PendingIntent.getActivity(
		this,
		nextRequestCode(),
		intentToOpenApp(Bundled.startupDomain),
		PendingIntent.FLAG_MUTABLE
	)
}

fun CoreRunnerService.intentForAppNotification(notificationId: Int): PendingIntent {
	val intent = Intent(this, DashboardAppActivity::class.java)
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
		.setAction(customIntentAction(OPEN_APP_NOTIFICATION_ACTION))
		.putExtra(APP_DOMAIN, Bundled.launcherDomain)
		.putExtra(NOTIFICATION_ID, notificationId)
	return PendingIntent.getActivity(
		this,
		nextRequestCode(),
		intent,
		PendingIntent.FLAG_IMMUTABLE
	)
}

private const val START_APP_ACTION = "start-app"
private const val FOCUS_APP_ACTION = "focus-app"
private const val OPEN_APP_NOTIFICATION_ACTION = "open-app-notification"
const val APP_COMPONENT_ENTRYPOINT = "app-component-entrypoint"
const val CONNECTOR_ID_OF_3NWEB_APP_INSTANCE = "connector-id"
private const val APP_URL_HASH = "app-url-hash"
private const val NOTIFICATION_ID = "notification-id"

fun CoreRunnerService.startStartupApp(startupUrlHash: String?) {
	val intent = intentToOpenApp(Bundled.startupDomain)
	if (startupUrlHash != null) {
		intent.putExtra(APP_URL_HASH, startupUrlHash)
	}
	startActivity(intent)
}

private fun CoreRunnerService.intentToOpenApp(appDomain: String): Intent {
	val intent = Intent(this, classForApp(appDomain))
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
		.setAction(Intent.ACTION_MAIN)
		.putExtra(APP_DOMAIN, appDomain)
	return intent
}

fun CoreRunnerService.start3NWebAppGUIComponent(appDomain: String) {
	startActivity(intentToOpenApp(appDomain))
}

fun CoreRunnerService.start3NWebAppGUIComponent(
	connectorId: String, appDomain: String, entrypoint: String
) {
	val intent = Intent(this, classForApp(appDomain))
		.putExtra(APP_DOMAIN, appDomain)
		.putExtra(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE, connectorId)
		.putExtra(APP_COMPONENT_ENTRYPOINT, entrypoint)
		.setAction(customIntentAction(START_APP_ACTION))
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_MULTIPLE_TASK)
	startActivity(intent)
}

fun GenericAppActivity.focus3NWebAppGUIComponent(
	connectorId: String, appDomain: String, entrypoint: String,
	classOfExistingTask: Class<out GenericAppActivity>
) {
	val intent = Intent(this, classOfExistingTask)
		.putExtra(APP_DOMAIN, appDomain)
		.putExtra(CONNECTOR_ID_OF_3NWEB_APP_INSTANCE, connectorId)
		.putExtra(APP_COMPONENT_ENTRYPOINT, entrypoint)
		.setAction(customIntentAction(FOCUS_APP_ACTION))
		.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
		.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
	startActivity(intent)
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
