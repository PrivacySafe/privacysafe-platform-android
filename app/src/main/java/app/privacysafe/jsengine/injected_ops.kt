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
package app.privacysafe.jsengine

import android.content.res.AssetManager
import app.privacysafe.FnsForCoreInJS
import app.privacysafe.jsengine.caps.AssetsListFolder
import app.privacysafe.jsengine.caps.AssetsReadBytes
import app.privacysafe.jsengine.caps.ConnectivityIsOnlineCheck
import app.privacysafe.jsengine.caps.ExitAll
import app.privacysafe.jsengine.caps.JSStartComponentOp
import app.privacysafe.jsengine.caps.ShowSystemErrorMsgBox
import app.privacysafe.jsengine.caps.UIStartAppActivity
import app.privacysafe.jsengine.caps.UICloseAppActivity
import app.privacysafe.jsengine.caps.UIFocusAppActivity
import app.privacysafe.jsengine.caps.DecryptWithDeviceKey
import app.privacysafe.jsengine.caps.EncryptWithDeviceKey
import app.privacysafe.jsengine.caps.OpenExternalOps
import app.privacysafe.jsengine.caps.ScanUrlQROps
import app.privacysafe.jsengine.ops.DelayFn
import app.privacysafe.jsengine.ops.FhClose
import app.privacysafe.jsengine.ops.FhRead
import app.privacysafe.jsengine.ops.FhStat
import app.privacysafe.jsengine.ops.FhSync
import app.privacysafe.jsengine.ops.FhTruncate
import app.privacysafe.jsengine.ops.FhWrite
import app.privacysafe.jsengine.ops.FileDescriptors
import app.privacysafe.jsengine.ops.FsAppendFile
import app.privacysafe.jsengine.ops.FsCopyFile
import app.privacysafe.jsengine.ops.FsLStat
import app.privacysafe.jsengine.ops.FsMkdir
import app.privacysafe.jsengine.ops.FsOpen
import app.privacysafe.jsengine.ops.FsReadFile
import app.privacysafe.jsengine.ops.FsReaddir
import app.privacysafe.jsengine.ops.FsReadlink
import app.privacysafe.jsengine.ops.FsRename
import app.privacysafe.jsengine.ops.FsRmdir
import app.privacysafe.jsengine.ops.FsStat
import app.privacysafe.jsengine.ops.FsSymlink
import app.privacysafe.jsengine.ops.FsTruncate
import app.privacysafe.jsengine.ops.FsUnlink
import app.privacysafe.jsengine.ops.FsWriteFile
import app.privacysafe.jsengine.ops.ListCoreObjPath
import app.privacysafe.jsengine.ops.DisconnectFromCore
import app.privacysafe.jsengine.ops.OpenWebSocketFn
import app.privacysafe.jsengine.ops.RandomFn
import app.privacysafe.jsengine.ops.RequestFn
import app.privacysafe.jsengine.ops.WebSockets
import app.privacysafe.jsengine.ops.nacl.NaclSBoxOpenOp
import app.privacysafe.jsengine.ops.nacl.NaclSBoxPackOp
import java.nio.file.Path
import java.util.concurrent.Executor

private fun makeCommonInjectedFns(): Array<InjectedFn> {
	return arrayOf(
		DelayFn(),
		RandomFn()
	)
}

fun makeCoreInjectedFns(
	fns: FnsForCoreInJS, basePath: Path, assets: AssetManager, cryptoExec: Executor
): Array<InjectedFn> {
	val descriptors = FileDescriptors(basePath)
	val webSockets = WebSockets(fns.makePortForWS)
	return makeCommonInjectedFns() + arrayOf(
		FsStat(basePath),
		FsLStat(basePath),
		FsAppendFile(basePath),
		FsCopyFile(basePath),
		FsMkdir(basePath),
		FsOpen(basePath, descriptors),
		FsReaddir(basePath),
		FsReadFile(basePath),
		FsReadlink(basePath),
		FsRename(basePath),
		FsRmdir(basePath),
		FsSymlink(basePath),
		FsTruncate(basePath),
		FsUnlink(basePath),
		FsWriteFile(basePath),
		FhClose(descriptors),
		FhRead(descriptors),
		FhStat(descriptors),
		FhSync(descriptors),
		FhTruncate(descriptors),
		FhWrite(descriptors),
		RequestFn(),
		OpenWebSocketFn(webSockets),
		UIStartAppActivity(fns.startAndroidActivity),
		UICloseAppActivity(fns.closeActivity),
		UIFocusAppActivity(fns.focusActivity),
		ShowSystemErrorMsgBox(fns.showSystemErrorBox),
		ExitAll(fns.exitAll),
		JSStartComponentOp(fns.startJSEngineComponent),
		AssetsReadBytes(assets),
		AssetsListFolder(assets),
		EncryptWithDeviceKey(),
		DecryptWithDeviceKey(),
		ConnectivityIsOnlineCheck(fns.indicator),
		OpenExternalOps(fns.openExternal),
		ScanUrlQROps(fns.scanUrlQR),
		NaclSBoxOpenOp(cryptoExec),
		NaclSBoxPackOp(cryptoExec)
	)
}

fun makeAppInjectedFns(fns: FnsForAppInJS): Array<InjectedFn> {
	return makeCommonInjectedFns() + arrayOf(
		ListCoreObjPath(fns.listCoreObjPathOp),
		DisconnectFromCore(fns.disconnectFromCoreOp)
	)
}
