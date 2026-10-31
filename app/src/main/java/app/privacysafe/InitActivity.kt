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
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.javascriptengine.SandboxUnsupportedException
import app.privacysafe.utils.Permission
import app.privacysafe.utils.PermissionsAlerts
import app.privacysafe.utils.canShowAlertAboutMissingPermission
import app.privacysafe.utils.checkPermissionAndRegisterRequesterIfNeeded
import app.privacysafe.utils.showAlertDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class InitActivity : ComponentActivity() {

	private val scope = CoroutineScope(Dispatchers.Main)
	private lateinit var coreSrvConn: ServiceConnection

	private lateinit var notifications: NotificationManager

	private lateinit var core: CoreInit

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		setContentView(R.layout.init_layout)
		notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
		val permissionRequester = checkPermissionAndRegisterRequesterIfNeeded(Permission.POST_NOTIFICATIONS)

		scope.launch {
			val havePermissions = if (permissionRequester == null) { true } else { permissionRequester() }
			if (!havePermissions && canShowAlertAboutMissingPermission(2, PermissionsAlerts.POST_NOTIFICATIONS)) {
				showAlertDialog(
					getString(R.string.notification_perm_dialog_title),
					getString(R.string.notification_perm_dialog_message),
					getString(R.string.ok_btn_txt)
				)
			}
			startCoreServiceAndForwardToSystemApp()
		}
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
	}

	private fun startCoreServiceAndForwardToSystemApp() {
		val (conn, coreDef) = this.startAndBindCoreService()
		coreSrvConn = conn
		scope.launch {
			core = coreDef.await()
			ensureJSRunnerRunningOrExitProcess(core)
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

	private suspend fun ensureJSRunnerRunningOrExitProcess(core: CoreInit) {
		try {
			core.whenJSRunnerInitialized()
			return
		} catch (_: SandboxUnsupportedException) {
			showAlertDialog(
				resources.getString(R.string.missing_sandbox_dialog_title),
				getString(R.string.missing_sandbox_dialog_message),
				getString(R.string.close_btn_txt)
			)
		} catch (err: Throwable) {
			showAlertDialog(
				resources.getString(R.string.start_err_dialog_title),
				"${getString(R.string.start_err_dialog_message)}\n${err.stackTraceToString()}",
				getString(R.string.close_btn_txt)
			)
		}
		finishAndRemoveTask()
		core.exit()
	}

	override fun onDestroy() {
		if (this::coreSrvConn.isInitialized) {
			unbindService(coreSrvConn)
		}
		super.onDestroy()
	}

}

