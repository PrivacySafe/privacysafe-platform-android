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

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.os.HandlerThread
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.BufferedReader
import java.io.InputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

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

@OptIn(ExperimentalEncodingApi::class)
fun String.decodeBase64(): ByteArray {
	return Base64.Default.decode(this)
}

@OptIn(ExperimentalEncodingApi::class)
fun ByteArray.toBase64(): String {
	return Base64.Default.encode(this)
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
	val ext = path.slice(indOfDot..(path.length-1))
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

fun showAlertDialog(ctx: Context, title: String, msg: String) {
	AlertDialog.Builder(ctx)
		.setTitle(title)
		.setMessage(msg)
		.setPositiveButton("OK", { _dialog, _which ->
		})
		.setNegativeButton("Cancel", { _dialog, _which ->
		})
		.create()
		.show()
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

	interface Notifications {
		companion object {
			const val requestCode = 1
			const val name = "android.permission.POST_NOTIFICATIONS"
		}
	}

	interface Camera {
		companion object {
			const val requestCode = 2
			const val name = Manifest.permission.CAMERA
		}
	}

}










































