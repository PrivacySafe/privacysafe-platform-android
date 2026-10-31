package app.privacysafe.utils

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.webkit.PermissionRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.io.BufferedReader
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.io.encoding.Base64
import kotlin.io.path.Path

fun makeSequentialStringIdGenerator(): () -> String {
	val idCount = AtomicLong(0)
	return {
		val id = idCount.addAndGet(1)
		id.toString()
	}
}

fun makeSequentialIntegerIdGenerator(): () -> Int {
	val idCount = AtomicInteger(0)
	return {
		idCount.addAndGet(1)
	}
}

fun String.decodeBase64(): ByteArray {
	return Base64.decode(this)
}

fun ByteArray.toBase64(): String {
	return Base64.encode(this)
}

private val extToMime = mapOf<String, String>(
	Pair(".js", "text/javascript"),
	Pair(".mjs", "text/javascript"),
	Pair(".css", "text/css"),
	Pair(".html", "text/html"),
	Pair(".svg", "image/svg+xml"),
	Pair(".png", "image/png"),
	Pair(".webp", "image/webp"),
	Pair(".jpeg", "image/jpeg"),
	Pair(".jpg", "image/jpeg"),
	Pair(".gif", "image/gif"),
)

fun mimeFromFileExt(path: String): String? {
	val indOfDot = path.lastIndexOf(".")
	if (indOfDot < 0) {
		return null
	}
	val ext = path.slice(indOfDot..<path.length)
	return extToMime[ext]
}

fun InputStream.readToString(): String {
	return this.bufferedReader().use(BufferedReader::readText)
}

fun String.reverseDomain(): String {
	return this.split(".").reversed().joinToString(".")
}

abstract class RuntimeException : Throwable() {
	abstract fun toJSON(): String
}

fun <T> CoroutineScope.execBlocking(code: suspend () -> T): T {
	val deferred = CompletableFuture<T>()
	this.launch {
		try {
			deferred.complete(code())
		} catch (exc: Throwable) {
			deferred.completeExceptionally(exc)
		}
	}
	try {
		return deferred.get()
	} catch (exc: ExecutionException) {
		throw exc.cause ?: exc
	}
}

suspend fun <T> Executor.computeAsync(code: () -> T): T {
	val deferred = CompletableDeferred<T>()
	this.execute {
		try {
			deferred.complete(code())
		} catch (exc: Throwable) {
			deferred.completeExceptionally(exc)
		}
	}
	return deferred.await()
}

/**
 * Systematic collection of constants, relevant to bundling and usage of bundled assets.
 */
interface Bundled {

	interface Path {
		companion object {
			const val webviewPreload = "scripts-webview"
			const val apps = "bundled-apps"
			const val preloadUrl = "/setup-w3n.bundle.js"
			const val startupPreloadUrl = "/setup-w3n-for-startup.bundle.js"
		}
	}

	companion object {
		const val startupDomain = "startup.app.privacysafe.io"
		const val launcherDomain = "launcher.app.privacysafe.io"
		const val contactsDomain = "contacts.app.privacysafe.io"
		const val inboxDomain = "inbox.app.privacysafe.io"
		const val chatDomain = "chat.app.privacysafe.io"
		const val storageDomain = "files.app.privacysafe.io"
		const val treasureDomain = "treasure.app.privacysafe.io"
	}

}

interface Permission {

	companion object {
		const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"
		const val CAMERA = Manifest.permission.CAMERA
		const val RECORD_AUDIO = Manifest.permission.RECORD_AUDIO

		const val WEBKIT_RESOURCE_AUDIO_CAPTURE = PermissionRequest.RESOURCE_AUDIO_CAPTURE
		const val WEBKIT_RESOURCE_VIDEO_CAPTURE = PermissionRequest.RESOURCE_VIDEO_CAPTURE
	}

}

fun Context.getActivityManager(): ActivityManager {
	return getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
}

fun Context.customIntentAction(action: String): String {
	return "$packageName/$action"
}

fun Context.customActionIn(intent: Intent): String? {
	val action = intent.action
	return if (action?.startsWith("$packageName/") == true) {
		action.substring(packageName.length+1)
	} else {
		null
	}
}

private const val ANDROID_UTIL_FOLDER = "util-android"

fun Context.pathInAndroidUtilFolder(pathInUtil: String): Path {
	val dataDir = dataDir.absolutePath
	return Path("$dataDir/${ANDROID_UTIL_FOLDER}/${pathInUtil}")
}

fun Context.readFileBytesFromAndroidUtil(pathInUtil: String): ByteArray? {
	val fPath = pathInAndroidUtilFolder(pathInUtil)
	return if (Files.exists(fPath)) {
		Files.readAllBytes(fPath)
	} else { null }
}

fun Context.writeFileIntoAndroidUtil(pathInUtil: String, content: ByteArray) {
	val fPath = pathInAndroidUtilFolder(pathInUtil)
	Files.createDirectories(fPath.parent)
	Files.write(fPath, content, StandardOpenOption.CREATE)
}

fun Context.readFileFromAndroidUtil(pathInUtil: String): String? {
	val binaryContent = readFileBytesFromAndroidUtil(pathInUtil)
	return if (binaryContent != null) {
		String(binaryContent, Charsets.UTF_8)
	} else { null }
}

inline fun <reified T> Context.readJsonFileFromAndroidUtil(pathInUtil: String): T? {
	val txtContent = readFileFromAndroidUtil(pathInUtil)
	return if (txtContent != null) {
		Json.decodeFromString<T>(txtContent)
	} else { null }
}

inline fun <reified T> Context.writeJsonFileIntoAndroidUtil(pathInUtil: String, json: T) {
	val txtContent = Json.encodeToString(json)
	writeFileIntoAndroidUtil(pathInUtil, txtContent.encodeToByteArray())
}