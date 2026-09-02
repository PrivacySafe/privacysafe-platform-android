/*
 Copyright (C) 2020 - 2026 3NSoft Inc.
 
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

import { ExposedObj, CoreSideServices, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';
import { proxyFileDialogsCAP } from "./file-dialogs/file-dialogs-cap-ipc";
import { exposeUserNotificationsCAP } from "./user-notifications/user-notifications-cap-ipc";
import { exposeGetFSResourceCAP } from './fs-resource/fs-resource-caps-ipc';
import { exposeClipboardCAP } from './clipboard/clipboard-cap-ipc';
import { exposeDeviceFilesCAP } from './device-files/device-files-cap-ipc';
import { exposeMountsCAP } from './mounts/mounts-cap-ipc';

type ShellCAPs = web3n.shell.ShellCAPs;

export function exposeShellCAPs(
	cap: ShellCAPs, expServices: CoreSideServices
): ExposedObj<ShellCAPs> {
	const wrap: ExposedObj<ShellCAPs> = {};
	if (cap.fileDialogs) {
		wrap.fileDialogs = proxyFileDialogsCAP(cap.fileDialogs, expServices);
	}
	if (cap.userNotifications) {
		wrap.userNotifications = exposeUserNotificationsCAP(
			cap.userNotifications, expServices
		);
	}
	if (cap.watchStartCmds) {
		wrap.watchStartCmds = jsonSrv.wrapObservingFunc(
			cap, obs => cap.watchStartCmds!(obs)
		);
	}
	if (cap.getFSResource) {
		wrap.getFSResource = exposeGetFSResourceCAP(
			cap.getFSResource, expServices
		);
	}
	if (cap.clipboard) {
		wrap.clipboard = exposeClipboardCAP(cap.clipboard);
	}
	if (cap.deviceFiles) {
		wrap.deviceFiles = exposeDeviceFilesCAP(cap.deviceFiles, expServices);
	}
	if (cap.mounts) {
		wrap.mounts = exposeMountsCAP(cap.mounts, expServices);
	}
	([
		'getStartedCmd', 'startAppWithParams', 'openDashboard', 'openURL'
	] as (keyof ShellCAPs)[]).filter(method => !!cap[method])
	.forEach(method => {
		if (cap[method]) {
			wrap[method] = jsonSrv.wrapReqReplySrvMethod(cap, method);
		}
	});
	const findReferencedObj = expServices.getOriginalObj.bind(expServices);
	([
		'openFile', 'openFolder', 'openInMounted'
	] as (keyof ShellCAPs)[]).filter(method => !!cap[method])
	.forEach(method => {
		if (cap[method]) {
			wrap[method] = jsonSrv.wrapReqReplySrvMethod(cap, method, { findReferencedObj });
		}
	});
	if (cap.scanUrlQR) {
		wrap.scanUrlQR = jsonSrv.wrapReqReplyFunc(cap.scanUrlQR);
	}
	return wrap;
}


Object.freeze(exports);