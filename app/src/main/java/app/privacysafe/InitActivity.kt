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

import android.app.NotificationManager
import android.content.Context.NOTIFICATION_SERVICE
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.webkit.PermissionRequest
import androidx.activity.ComponentActivity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class InitActivity : ComponentActivity() {

	private val scope = CoroutineScope(Dispatchers.Main)
	private lateinit var coreSrvConn: ServiceConnection

	private lateinit var notifications: Notifications

	private lateinit var core: CoreInit

	override fun onCreate(savedInstanceState: Bundle?) {
		Log.d("w3n", "-> ${this}.onCreate() \n action: ${intent.action} \n data: ${intent.data}")

		super.onCreate(savedInstanceState)
		setContentView(R.layout.init_layout)
		notifications = Notifications(this)

		Log.d("w3n", "intent at creation of InitActivity \n action: ${intent.action} \n data: ${intent.data}")

		scope.launch {
			val havePermissions = notifications.request()
			if (havePermissions) {
				addCoreRunnerNotificationChannelTo(applicationContext, notifications.mngr)
				startCoreRunnerService(applicationContext)
				startCoreServiceAndForwardToSystemApp()
			} else {
				finishAndRemoveTask()
			}
		}
	}

	override fun onNewIntent(intent: Intent) {

		Log.d("w3n", "-> ${this}.onNewIntent() \n action: ${intent.action} \n data: ${intent.data}")

		super.onNewIntent(intent)
	}

	override fun onResume() {

		Log.d("w3n", "-> ${this}.onResume() \n action: ${intent.action} \n data: ${intent.data}")

		super.onResume()
	}

	override fun onTrimMemory(level: Int) {
		super.onTrimMemory(level)
	}

	override fun onLowMemory() {
	}

	private fun startCoreServiceAndForwardToSystemApp() {

		val (conn, coreDef) = bindCoreServiceForInit(this) {
			finishAndRemoveTask()
		}
		coreSrvConn = conn
		scope.launch {
			core = coreDef.await()
			core.setUICallbacks(
				close = { finish() }
			)
			val urlToProcess = intent.data?.toString()
			if (core.isUserLoggedIn) {
				if (urlToProcess == null) {
					core.openLauncher()
				} else {
					core.processURL(urlToProcess)
				}
			} else {
				core.startLogin(urlToProcess)
			}
			finishAndRemoveTask()
		}
	}

	override fun onRequestPermissionsResult(
		requestCode: Int,
		permissions: Array<out String?>,
		grantResults: IntArray,
		deviceId: Int
	) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults, deviceId)
		if (requestCode != Permission.Notifications.requestCode) {
			return
		}
		notifications.onRequestPermissionsResult(permissions, grantResults)
	}

	override fun onDestroy() {
		if (this::coreSrvConn.isInitialized) {
			unbindService(coreSrvConn)
		}
		super.onDestroy()
	}

}

private class Notifications(
	val activity: InitActivity,
) {
	val mngr: NotificationManager = activity.getSystemService(NOTIFICATION_SERVICE) as NotificationManager

	val enabled get() = mngr.areNotificationsEnabled()

	var deferred = CompletableDeferred<Boolean>()

	suspend fun request(): Boolean {
		if (enabled) {
			return true
		}
		activity.requestPermissions(
			arrayOf(
				Permission.Notifications.name,
				// TODO this is an adhoc way to quickly check webrtc run. But, these asks should be in 3NWeb app activity.
				//      May be we should have a permissions getting object.
				//      Sound and video pass through to peer. Choices' code was also for electron. The rest is app's
				//      concerns.
				PermissionRequest.RESOURCE_AUDIO_CAPTURE,
				PermissionRequest.RESOURCE_VIDEO_CAPTURE
			),
			Permission.Notifications.requestCode
		)
		while (!deferred.isCompleted) {
			if (enabled) {
				deferred.complete(true)
				break
			}
			delay(100)
		}
		return enabled
	}

	fun onRequestPermissionsResult(
		permissions: Array<out String?>,
		grantResults: IntArray,
	) {
		for (i in 0..permissions.size-1) {
			val permission = permissions[i]
			val result = grantResults[i]
			when (permission) {
				Permission.Notifications.name -> {
					if (result == PackageManager.PERMISSION_GRANTED) {
						deferred.complete(true)
					}
				}
			}
		}

	}

}

