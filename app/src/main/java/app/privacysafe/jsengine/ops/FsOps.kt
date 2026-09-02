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
package app.privacysafe.jsengine.ops

import android.os.StatFs
import app.privacysafe.RuntimeException
import app.privacysafe.jsengine.InjectedSyncHandler
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import kotlinx.serialization.protobuf.ProtoBuf
import java.io.EOFException
import java.io.FileNotFoundException
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.file.AccessDeniedException
import java.nio.file.DirectoryNotEmptyException
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.NotDirectoryException
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.atomics.AtomicInt
import kotlin.concurrent.atomics.ExperimentalAtomicApi
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.deleteExisting
import kotlin.io.path.deleteRecursively
import kotlin.io.path.exists
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.moveTo
import kotlin.io.path.name

abstract class FsOp (
	injectName: String,
	protected val basePath: Path,
) : InjectedSyncHandler(injectName) {

	protected val blksize = StatFs(basePath.toString()).blockSizeLong.toInt()

	protected fun getPath(pathStr: String): Path {
		val path = Paths.get(pathStr).normalize()
		return basePath.resolve(path)
	}

	@Serializable
	data class PathArgs(val path: String)

	@OptIn(ExperimentalSerializationApi::class)
	protected fun getPathFromPathOnlyArgs(argsBytes: ByteArray): Path {
		val (path) = ProtoBuf.decodeFromByteArray<PathArgs>(argsBytes)
		return getPath(path)
	}

	@Serializable
	data class DirRecursiveArgs(val path: String, val recursive: Boolean)

}

class FsException(
	val excCode: String
) : RuntimeException() {
	override fun toJSON(): String {
		return """{ "runtimeException": true, "type": "file", "code": "$excCode", "path": "" }"""
	}
}

fun fsExc(excCode: String): FsException {
	return FsException(excCode)
}

fun fsExc(exc: IOException): FsException {
	return fsExc(when (exc) {
		is NoSuchFileException -> FsExcCodes.ENOENT
		is FileNotFoundException -> FsExcCodes.ENOENT
		is NotDirectoryException -> FsExcCodes.ENOTDIR
		is AccessDeniedException -> FsExcCodes.EPERM
		is FileAlreadyExistsException -> FsExcCodes.EEXIST
		is DirectoryNotEmptyException -> FsExcCodes.ENOTEMPTY
		is EOFException -> FsExcCodes.EEOF
		// TODO map other fs exceptions

		else -> FsExcCodes.EIO
	})
}

@Serializable
data class StatsPB(
	val isFile: Boolean,
	val isDirectory: Boolean,
	val isSymbolicLink: Boolean,
	val birthtimeMs: Long,
	val mtimeMs: Long,
	val atimeMs: Long,
	val size: Long,
	val blocks: Long,
	val blksize: Int
)

interface FsExcCodes {
	companion object {
		const val ENOENT = "ENOENT"
		const val EEXIST = "EEXIST"
		const val ENOTDIR = "ENOTDIR"
		const val ENOTFILE = "ENOTFILE"
		const val EISDIR = "EISDIR"
		const val ENOTEMPTY = "ENOTEMPTY"
		const val EEOF = "EEOF"
		const val EPERM = "EPERM"
		const val EBUSY = "EBUSY"
		const val EIO = "EIO"
		const val ENOSYS = "ENOSYS"
	}
}

private fun statPath(path: Path, blksize: Int): StatsPB {
	val attrs = Files.readAttributes(path, BasicFileAttributes::class.java)
	val size = attrs.size()
	val blocks = size/blksize + if ((size % blksize) > 0) { 1 } else { 1 }
	return StatsPB(
		attrs.isRegularFile,
		attrs.isDirectory,
		attrs.isSymbolicLink,
		attrs.creationTime().toMillis(),
		attrs.lastModifiedTime().toMillis(),
		attrs.lastAccessTime().toMillis(),
		size,
		blocks,
		blksize
	)
}

class FsStat (basePath: Path) : FsOp ("fs_stat", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		try {
			val path = getPathFromPathOnlyArgs(argsBytes)
			return ProtoBuf.encodeToByteArray(statPath(path, blksize))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsLStat (basePath: Path) : FsOp ("fs_lstat", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		try {
			val path = getPathFromPathOnlyArgs(argsBytes)
			return ProtoBuf.encodeToByteArray(statPath(path, blksize))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsAppendFile (basePath: Path) : FsOp ("fs_appendFile", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		try {
			val (path, chunk) = ProtoBuf.decodeFromByteArray<AppendFileArgs>(argsBytes)
			Files.write(
				getPath(path), chunk,
				StandardOpenOption.APPEND, StandardOpenOption.CREATE, StandardOpenOption.SYNC
			)
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class AppendFileArgs(val path: String, val chunk: ByteArray)

}

class FsCopyFile (basePath: Path) : FsOp ("fs_copyFile", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (src, dst, overwrite) = ProtoBuf.decodeFromByteArray<CopyFileArgs>(argsBytes)


		TODO("Not yet implemented")
	}

	@Serializable
	data class CopyFileArgs(val src: String, val dst: String, val overwrite: Boolean)

}

class FsMkdir (basePath: Path) : FsOp ("fs_mkdir", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, recursive) = ProtoBuf.decodeFromByteArray<DirRecursiveArgs>(argsBytes)
		val dir = getPath(path)
		try {
			if (recursive) {
				Files.createDirectories(dir)
			} else {
				Files.createDirectory(dir)
			}
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsOpen (
	basePath: Path,
	val descriptors: FileDescriptors
) : FsOp ("fs_open", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, openFlag) = ProtoBuf.decodeFromByteArray<OpenFileArgs>(argsBytes)
		val filePath = getPath(path)
		val opts = openOptsFromNodeFlag(openFlag)
		try {
			return ProtoBuf.encodeToByteArray(IntValue(descriptors.openNew(filePath, opts)))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class OpenFileArgs(val path: String, val openFlag: String)

}

class FsReaddir (basePath: Path) : FsOp ("fs_readdir", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val dir = getPathFromPathOnlyArgs(argsBytes)
		try {
			return ProtoBuf.encodeToByteArray(StringListValue(
				dir.listDirectoryEntries().map { it.name }
			))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsReadFile (basePath: Path) : FsOp ("fs_readFile", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val path = getPathFromPathOnlyArgs(argsBytes)
		try {
			return Files.readAllBytes(path)
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsReadlink (basePath: Path) : FsOp ("fs_readlink", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val path = getPathFromPathOnlyArgs(argsBytes)
		try {
			return ProtoBuf.encodeToByteArray(StringValue(Files.readSymbolicLink(path).toString()))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsRename (basePath: Path) : FsOp ("fs_rename", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (oldPath, newPath) = ProtoBuf.decodeFromByteArray<RenameArgs>(argsBytes)
		val target = getPath(newPath)
		val src = getPath(oldPath)
		try {
			src.moveTo(target)
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class RenameArgs(val oldPath: String, val newPath: String)

}

class FsRmdir (basePath: Path) : FsOp ("fs_rmdir", basePath) {

	@OptIn(ExperimentalSerializationApi::class, ExperimentalPathApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, recursive) = ProtoBuf.decodeFromByteArray<DirRecursiveArgs>(argsBytes)
		val dir = getPath(path)
		try {
			if (recursive) {
				dir.deleteRecursively()
			}else {
				dir.deleteExisting()
			}
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class OpCallArgs(val path: String, val recursive: Boolean)

}

class FsSymlink (basePath: Path) : FsOp ("fs_symlink", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, target) = ProtoBuf.decodeFromByteArray<SymLinkCreateArgs>(argsBytes)
		try {
			Files.createSymbolicLink(getPath(path), getPath(target))
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class SymLinkCreateArgs(val path: String, val target: String)

}

class FsTruncate (basePath: Path) : FsOp ("fs_truncate", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, len) = ProtoBuf.decodeFromByteArray<TruncateFileArgs>(argsBytes)
		try {
			val file = RandomAccessFile(getPath(path).toFile(), "rw")
			file.setLength(len)
			file.close()
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class TruncateFileArgs(val path: String, val len: Long)

}

class FsUnlink (basePath: Path) : FsOp ("fs_unlink", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val path = getPathFromPathOnlyArgs(argsBytes)
		try {
			Files.delete(path)
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FsWriteFile (basePath: Path) : FsOp ("fs_writeFile", basePath) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (path, writeFlag, content) = ProtoBuf.decodeFromByteArray<WriteFileArgs>(argsBytes)
		val filePath = getPath(path)
		val writeOpts = openOptsFromNodeFlag(writeFlag).write
		if (writeOpts == null) {
			throw fsExc(FsExcCodes.EPERM)
		}
		try {
			Files.write(filePath, content, *writeOpts.toTypedArray())
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class WriteFileArgs(val path: String, val writeFlag: String, val content: ByteArray)

}

data class OpenOpts(val read: Set<StandardOpenOption>?, val write: Set<StandardOpenOption>?) {
	val isWritable: Boolean get() {
		return (write != null)
	}
	val isReadable: Boolean get() {
		return (read != null)
	}
	val exclusiveWrite: Boolean get() {
		return ((write != null) && write.contains(SOOpt.CREATE_NEW))
	}
	val truncateExisting: Boolean get() {
		return ((write != null) && write.contains(SOOpt.TRUNCATE_EXISTING))
	}
	fun asMode(): String {
		return if (isWritable) {
			if (write!!.contains(SOOpt.SYNC)) { "rws" } else { "rw" }
		} else {
			"r"
		}
	}
}

private typealias SOOpt = StandardOpenOption

private fun openOptsFromNodeFlag(flag: String): OpenOpts {
	return when (flag) {
		"a" -> {
			OpenOpts(null, setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE))
		}
		"ax" -> {
			OpenOpts(null, setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE_NEW))
		}
		"a+" -> {
			OpenOpts(setOf(SOOpt.READ), setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE))
		}
		"ax+" -> {
			OpenOpts(setOf(SOOpt.READ), setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE_NEW))
		}
		"as" -> {
			OpenOpts(null, setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE, SOOpt.SYNC))
		}
		"as+" -> {
			OpenOpts(setOf(SOOpt.READ, SOOpt.SYNC), setOf(SOOpt.WRITE, SOOpt.APPEND, SOOpt.CREATE, SOOpt.SYNC))
		}
		"r" -> {
			OpenOpts(setOf(SOOpt.READ), null)
		}
		"rs" -> {
			OpenOpts(setOf(SOOpt.READ, SOOpt.SYNC), null)
		}
		"r+" -> {
			OpenOpts(setOf(SOOpt.READ), setOf(SOOpt.WRITE))
		}
		"rs+" -> {
			OpenOpts(setOf(SOOpt.READ, SOOpt.SYNC), setOf(SOOpt.WRITE, SOOpt.SYNC))
		}
		"w" -> {
			OpenOpts(null, setOf(SOOpt.WRITE, SOOpt.CREATE, SOOpt.TRUNCATE_EXISTING))
		}
		"wx" -> {
			OpenOpts(null, setOf(SOOpt.WRITE, SOOpt.CREATE_NEW, SOOpt.TRUNCATE_EXISTING))
		}
		"w+" -> {
			OpenOpts(setOf(SOOpt.READ), setOf(SOOpt.WRITE, SOOpt.CREATE, SOOpt.TRUNCATE_EXISTING))
		}
		"wx+" -> {
			OpenOpts(setOf(SOOpt.READ), setOf(SOOpt.WRITE, SOOpt.CREATE_NEW, SOOpt.TRUNCATE_EXISTING))
		}
		else -> {
			throw Exception("Unknown open flag value: $flag")
		}
	}
}

class FileHandler (
	val fd: Int,
	val path: Path,
	val opts: OpenOpts
) {
	var file: RandomAccessFile
	init {
		if (opts.isWritable) {
			if (path.exists()) {
				if (opts.exclusiveWrite) {
					throw FileAlreadyExistsException(path.toFile())
				}
			} else {
				Files.createFile(path)
			}
		}
		file = RandomAccessFile(path.toFile(), opts.asMode())
		if (opts.truncateExisting) {
			file.setLength(0)
		}
	}
}

@OptIn(ExperimentalAtomicApi::class)
class FileDescriptors (basePath: Path) {

	val blksize = StatFs(basePath.toString()).blockSizeLong.toInt()

	private val fhs = ConcurrentHashMap<Int, FileHandler>()
	private var fdCount = AtomicInt(0)

	fun openNew(path: Path, opts: OpenOpts): Int {
		var fd = fdCount.addAndFetch(1)
		while (fhs[fd] != null) {
			fd = fdCount.addAndFetch(1)
		}
		val fh = FileHandler(fd, path, opts)
		fhs[fh.fd] = fh
		return fh.fd
	}

	fun find(fd: Int): FileHandler? {
		return fhs[fd]
	}

	fun remove(fh: FileHandler) {
		if (fhs[fh.fd] == fh) {
			fhs.remove(fh.fd)
		}
	}

}

abstract class FhOp (
	injectName: String,
	protected val descriptors: FileDescriptors,
) : InjectedSyncHandler(injectName) {

	@Serializable
	data class FdArgs(val fd: Int)

	@OptIn(ExperimentalSerializationApi::class)
	protected fun parseFdOnlyArgs(argsBytes: ByteArray, throwIfMissing: Boolean = true): FileHandler? {
		val args = ProtoBuf.decodeFromByteArray<FdArgs>(argsBytes)
		val fh = descriptors.find(args.fd)
		if (throwIfMissing && (fh == null)) {
			throw NoSuchFileException("")
		}
		return fh
	}

	protected fun getFH(fd: Int): FileHandler {
		val fh = descriptors.find(fd)
		if (fh == null) {
			throw NoSuchFileException("")
		} else {
			return fh
		}
	}

	protected fun getReadable(fd: Int): FileHandler {
		val fh = getFH(fd)
		if (!fh.opts.isReadable) {
			throw AccessDeniedException("")
		} else {
			return fh
		}
	}

	protected fun getWritable(fd: Int): FileHandler {
		val fh = getFH(fd)
		if (!fh.opts.isWritable) {
			throw AccessDeniedException("")
		} else {
			return fh
		}
	}

}

class FhClose (descriptors: FileDescriptors) : FhOp("fh_close", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val fh = parseFdOnlyArgs(argsBytes, false)
		if (fh != null) {
			descriptors.remove(fh)
			fh.file.close()
		}
		return null
	}

}

class FhRead (descriptors: FileDescriptors) : FhOp("fh_read", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (fd, readPos, len) = ProtoBuf.decodeFromByteArray<ReadFdPosArg>(argsBytes)
		try {
			val fh = getReadable(fd)
			val buf = ByteArray(len)
			if (readPos != null) {
				fh.file.seek(readPos)
			}
			val bytesRead = fh.file.read(buf)
			if (bytesRead < 0) {
				throw fsExc(FsExcCodes.EEOF)
			} else {
				return if (buf.size == bytesRead) {
					buf
				} else {
					buf.sliceArray(0..<bytesRead)
				}
			}
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class ReadFdPosArg(val fd: Int, val readPos: Long?, val len: Int)

}

class FhStat (descriptors: FileDescriptors) : FhOp("fh_stat", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		try {
			val fh = parseFdOnlyArgs(argsBytes)!!
			return ProtoBuf.encodeToByteArray(statPath(fh.path, descriptors.blksize))
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FhSync (descriptors: FileDescriptors) : FhOp("fh_sync", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		try {
			val fh = parseFdOnlyArgs(argsBytes)!!
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

}

class FhTruncate (descriptors: FileDescriptors) : FhOp("fh_truncate", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (fd, len) = ProtoBuf.decodeFromByteArray<FdTruncateArgs>(argsBytes)
		try {
			val fh = getWritable(fd)
			fh.file.setLength(len)
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class FdTruncateArgs(val fd: Int, val len: Long)

}

class FhWrite (descriptors: FileDescriptors) : FhOp("fh_write", descriptors) {

	@OptIn(ExperimentalSerializationApi::class)
	override fun call(argsBytes: ByteArray): ByteArray? {
		val (fd, writePos, chunk) = ProtoBuf.decodeFromByteArray<WriteAtFdPosArgs>(argsBytes)
		try {
			val fh = getWritable(fd)
			if (writePos != null) {
				fh.file.seek(writePos)
			}
			fh.file.write(chunk)
			return null
		} catch (exc: IOException) {
			throw fsExc(exc)
		}
	}

	@Serializable
	data class WriteAtFdPosArgs(val fd: Int, val writePos: Long?, val chunk: ByteArray)

}


















































