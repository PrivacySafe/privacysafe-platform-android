package app.privacysafe.utils

import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import app.privacysafe.GenericAppActivity
import app.privacysafe.R
import kotlinx.coroutines.CompletableDeferred

fun ComponentActivity.checkPermissionAndRegisterRequesterIfNeeded(
	permission: String
): (suspend () -> Boolean)? {
	if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
		return null
	}
	val deferred = CompletableDeferred<Boolean>()
	val requester = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
			isGranted -> deferred.complete(isGranted)
	}
	return suspend {
		try {
			requester.launch(permission)
			deferred.await()
		} finally {
			requester.unregister()
		}
	}
}

fun GenericAppActivity.checkMultiplePermissionsAndRegisterRequesterIfNeeded(
	permissions: ArrayList<String>
): (suspend () -> Map<String, Boolean>)? {
	val missingPermissions = mutableListOf<String>()
	for (permission in permissions) {
		if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
			missingPermissions.add(permission)
		}
	}
	if (missingPermissions.isEmpty()) {
		return null
	}
	val deferred = CompletableDeferred<Map<String, Boolean>>()
	val requester = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
			grants -> deferred.complete(grants)
	}
	return suspend {
		try {
			requester.launch(missingPermissions.toTypedArray())
			deferred.await()
		} finally {
			requester.unregister()
		}
	}
}