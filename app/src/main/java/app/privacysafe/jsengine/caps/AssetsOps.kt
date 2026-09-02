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
package app.privacysafe.jsengine.caps

import android.content.res.AssetManager
import app.privacysafe.jsengine.InjectedSyncHandler
import app.privacysafe.jsengine.ops.FsExcCodes
import app.privacysafe.jsengine.ops.fsExc
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.io.IOException

abstract class AssetsOp (
	injectName: String,
	protected val assets: AssetManager
) : InjectedSyncHandler(injectName) {}

private fun getPath(fromPacks: Boolean, path: String): String {
	return if (fromPacks) {
		"bundled-app-packs${path.prefixSlash()}"
	} else {
		"bundled-apps${path.prefixSlash()}"
	}
}

fun String.prefixSlash(): String {
	return if (this.startsWith("/")) {
		this
	} else if (this.isEmpty()) {
		""
	} else {
		"/$this"
	}
}

class AssetsReadBytes (
	assets: AssetManager
) : AssetsOp("assets_readBytes", assets) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (
			fromPacks, path, start, end
		) = ProtoBuf.decodeFromByteArray<ReadFromAssetsPathArgs>(argsBytes)
		val filePath = getPath(fromPacks, path)
		return try {
			assets.open(filePath).use { stream ->
				if ((start != null) && (start > 0)) {
					stream.skip(start)
				}
				if (end == null) {
					stream.readBytes()
				} else {
					val buffer = ByteArray((
						end - if ((start == null) || (start < 0)) { 0 } else { start }
					).toInt())
					stream.read(buffer, 0, buffer.size)
					buffer
				}
			}
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class ReadFromAssetsPathArgs(val fromPacks: Boolean, val path: String, val start: Long?, val end: Long?)

}

class AssetsListFolder (
	assets: AssetManager
) : AssetsOp("assets_listFolder", assets) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (fromPacks, path) = ProtoBuf.decodeFromByteArray<AssetsPathArgs>(argsBytes)
		val dirPath = getPath(fromPacks, path)
		return try {
			val lst = assets.list(dirPath)
			if (lst == null) {
				throw fsExc(FsExcCodes.ENOENT)
			} else {
				ProtoBuf.encodeToByteArray(AssetsFolderListing(lst.map { name ->
					try {
						val str = assets.open("$dirPath/$name")
						str.close()
						AssetFolderItem(name, false)
					} catch (_: IOException) {
						AssetFolderItem(name, true)
					}
				}))
			}
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class AssetsPathArgs(val fromPacks: Boolean, val path: String)

	@Serializable
	data class AssetFolderItem(val name: String, val isFolder: Boolean)

	@Serializable
	data class AssetsFolderListing(val items: List<AssetFolderItem>)

}
