package app.privacysafe.jsengine.ops

import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardOpenOption
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.Path
import kotlin.io.path.deleteIfExists
import kotlin.io.path.deleteRecursively

abstract class AndroidUtilFsOp (
	injectName: String,
	private val utilAndroidDir: String
) : InjectedSyncHandler(injectName) {

	protected fun getPath(pathStr: String): Path {
		val path = Paths.get(pathStr).normalize()
		return Path(utilAndroidDir).resolve(path)
	}

	@OptIn(ExperimentalSerializationApi::class)
	protected fun getPathFromPathOnlyArgs(argsBytes: ByteArray): Path {
		val (path) = ProtoBuf.decodeFromByteArray<PathArgs>(argsBytes)
		return getPath(path)
	}

	@Serializable
	data class PathArgs(val path: String)

}

class WriteIntoAndroidUtilFsOp(
	utilAndroidDir: String
) : AndroidUtilFsOp("android_util_write_file", utilAndroidDir) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (pathStr, content) = ProtoBuf.decodeFromByteArray<WriteFileIntoAndroidUtilArgs>(argsBytes)
		val fPath = getPath(pathStr)
		Files.createDirectories(fPath.parent)
		Files.write(fPath, content, StandardOpenOption.CREATE)
		return null
	}

	@Serializable
	data class WriteFileIntoAndroidUtilArgs(val path: String, val content: ByteArray)

}

class ReadFromAndroidUtilFsOp(
	utilAndroidDir: String
) : AndroidUtilFsOp("android_util_read_file", utilAndroidDir) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val fPath = getPathFromPathOnlyArgs(argsBytes)
		return if (Files.isRegularFile(fPath)) {
			val content = Files.readAllBytes(fPath)
			ProtoBuf.encodeToByteArray(FileContentFromAndroidUtil(true, content))
		} else {
			ProtoBuf.encodeToByteArray(FileContentFromAndroidUtil(false, byteArrayOf()))
		}
	}

	@Serializable
	data class FileContentFromAndroidUtil(val fileFound: Boolean, val content: ByteArray)

}

class RemoveFromAndroidUtilFsOp(
	utilAndroidDir: String
) : AndroidUtilFsOp("android_util_remove", utilAndroidDir) {

	@OptIn(ExperimentalPathApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val fPath = getPathFromPathOnlyArgs(argsBytes)
		if (Files.isRegularFile(fPath)) {
			fPath.deleteIfExists()
		} else if (Files.isDirectory(fPath)) {
			fPath.deleteRecursively()
		}
		return null
	}

}
