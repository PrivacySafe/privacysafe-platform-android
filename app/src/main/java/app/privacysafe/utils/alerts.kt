package app.privacysafe.utils

import android.app.AlertDialog
import androidx.activity.ComponentActivity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.Serializable

suspend fun ComponentActivity.showAlertDialog(title: String, msg: String, btnTxt: String?) {
	val deferred = CompletableDeferred<Unit?>()
	val dialog = AlertDialog.Builder(this)
		.setTitle(title)
		.setMessage(msg)
		.setOnCancelListener {
			deferred.complete(null)
		}
		.setOnDismissListener {
			deferred.complete(null)
		}
	if (btnTxt != null) {
		dialog.setNeutralButton(btnTxt) { _, _ ->
			deferred.complete(null)
		}
	}
	dialog.show()
	deferred.await()
}

enum class PermissionsAlerts {
	POST_NOTIFICATIONS
}

@Serializable
data class PermissionsAlertsCount(
	var postNotifications: Int = 0
)

private const val alertsCountsFile = "alerts-count.json"

fun ComponentActivity.canShowAlertAboutMissingPermission(maxShows: Int, permission: PermissionsAlerts): Boolean {
	var counts = readJsonFileFromAndroidUtil<PermissionsAlertsCount>(alertsCountsFile)
	if (counts == null) {
		counts = PermissionsAlertsCount()
	}
	when (permission) {
		PermissionsAlerts.POST_NOTIFICATIONS -> {
			if (counts.postNotifications >= maxShows) {
				return false
			} else {
				counts.postNotifications += 1;
			}
		}
	}
	writeJsonFileIntoAndroidUtil(alertsCountsFile, counts)
	return true
}
