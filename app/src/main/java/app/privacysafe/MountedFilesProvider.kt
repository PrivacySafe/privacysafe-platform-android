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

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.Log
import androidx.core.net.toUri
import app.privacysafe.jsengine.CallsIntoCore
import app.privacysafe.utils.execBlocking
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.FileNotFoundException
import java.net.URLConnection
import java.nio.file.ReadOnlyFileSystemException

class MountedFilesProvider : ContentProvider() {

	private val ioScope = CoroutineScope(Dispatchers.IO)

	private lateinit var coreFns: CallsIntoCore.MountedFsFns

	private fun ensureInit() {
		val deferredFns = whenCoreFnsSet
		if (this::coreFns.isInitialized) {
			return
		} else if (deferredFns == null) {
			throw Exception("Initialization order is broken")
		}
		ioScope.execBlocking {
			deferredFns.await()
		}
	}

	override fun onCreate(): Boolean {
		val deferredFns = whenCoreFnsSet ?: return false
		ioScope.launch {
			coreFns = deferredFns.await()
			whenCoreFnsSet = null
		}
		return true
	}

	override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String?>?): Int {
		throw ReadOnlyFileSystemException()
	}

	override fun getType(uri: Uri): String? {
		ensureInit()
		val path = coreFns.pathFromContentURI(uri) ?: return null
		val mime = URLConnection.guessContentTypeFromName(path)
		return mime
	}

	override fun insert(uri: Uri, values: ContentValues?): Uri? {
		throw ReadOnlyFileSystemException()
	}

	override fun query(
		uri: Uri, projection: Array<out String?>?, selection: String?, selectionArgs: Array<out String?>?,
		sortOrder: String?
	): Cursor? {
		try {
			ensureInit()
			val path = coreFns.pathFromContentURI(uri) ?: return null
			val stats = coreFns.statItemInMountedFS(path) ?: return null
			val columnNames = projection ?: ALL_PROJECTIONS
			val cursor = MatrixCursor(columnNames)
			val row = cursor.newRow()
			for (col in columnNames) {
				when (col) {
					OpenableColumns.DISPLAY_NAME -> row.add(col, stats.name)
					OpenableColumns.SIZE -> row.add(col, stats.size)
					else -> row.add(col, null)
				}
			}
			return cursor
		} catch (err: Throwable) {
			Log.e("w3n", "error in MountedFilesProvider.query(), serving $uri", err)
			throw err
		}
	}

	override fun update(
		uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String?>?
	): Int {
		throw ReadOnlyFileSystemException()
	}

	override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
		try {
			ensureInit()
			val path = coreFns.pathFromContentURI(uri) ?: throw FileNotFoundException("URI is invalid")
			return coreFns.pumpBytesFromFileInMountedFS(path)
		} catch (err: Throwable) {
			Log.e("w3n", "error in MountedFilesProvider.openFile(), serving $uri", err)
			throw err
		}
	}

}

private var whenCoreFnsSet: CompletableDeferred<CallsIntoCore.MountedFsFns>? = CompletableDeferred()

fun provideCoreFnsToMountedFsProvider(coreFns: CallsIntoCore.MountedFsFns) {
	whenCoreFnsSet?.complete(coreFns)
}

private val ALL_PROJECTIONS = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)

fun Context.askAndroidToOpenAsContentFsURI(pathInFsURI: String) {
	val uri = "content://$packageName.fs/${ if (pathInFsURI.startsWith("/")) {
		pathInFsURI.substring(1)
	} else {
		pathInFsURI
	}}"
	try {
		val intent = Intent(Intent.ACTION_VIEW, uri.toUri())
			.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
			.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
		startActivity(intent)
	} catch (err: Throwable) {
		Log.e("w3n", "error in opening $uri", err)
	}
}
