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

import { Caller, callerSideJSONWrap as jsonCall } from 'core-3nweb-client-lib/build/ipc';
import { makeFileDialogs } from "./file-dialogs/file-dialogs-cap-ipc";
import { makeUserNotifications } from './user-notifications/user-notifications-cap-ipc';
import { makeGetFSResource } from './fs-resource/fs-resource-caps-ipc';
import { makeClipboard } from './clipboard/clipboard-cap-ipc';
import { makeDeviceFiles } from './device-files/device-files-cap-ipc';
import { makeMounts } from './mounts/mounts-cap-ipc';

type ShellCAPs = web3n.shell.ShellCAPs;

export function makeShellCaller(caller: Caller, objPath: string[]): ShellCAPs {
	if (!caller.listObj) {
		throw new Error(`Caller here expects to have method 'listObj'`);
	}
	const shellCAPs = caller.listObj(objPath) as (keyof ShellCAPs)[];
	let dialogFns: (keyof NonNullable<ShellCAPs['fileDialogs']>)[] | undefined = undefined;
	if (shellCAPs.includes('fileDialogs')) {
		const dialogsPath = objPath.concat('fileDialogs');
		dialogFns = caller.listObj(dialogsPath) as (keyof NonNullable<ShellCAPs['fileDialogs']>)[];
	}
	let clipboardFns: (keyof NonNullable<ShellCAPs['clipboard']>)[] | undefined = undefined;
	if (shellCAPs.includes('clipboard')) {
		const clipboardPath = objPath.concat('clipboard');
		clipboardFns = caller.listObj(clipboardPath) as (keyof NonNullable<ShellCAPs['clipboard']>)[];
	}
	return makeShellFollowingListing(
		shellCAPs, dialogFns, clipboardFns, caller, objPath
	);
}

export async function promiseShellCaller(
	caller: Caller, objPath: string[]
): Promise<ShellCAPs> {
	if (!caller.listObjAsync) {
		throw new Error(`Caller here expects to have method 'listObjAsync'`);
	}
	const shellCAPs = (await caller.listObjAsync(objPath)) as (keyof ShellCAPs)[];
	let dialogFns: (keyof NonNullable<ShellCAPs['fileDialogs']>)[] | undefined = undefined;
	if (shellCAPs.includes('fileDialogs')) {
		const dialogsPath = objPath.concat('fileDialogs');
		dialogFns = (
			await caller.listObjAsync(dialogsPath)
		) as (keyof NonNullable<ShellCAPs['fileDialogs']>)[];
	}
	let clipboardFns: (keyof NonNullable<ShellCAPs['clipboard']>)[] | undefined = undefined;
	if (shellCAPs.includes('clipboard')) {
		const clipboardPath = objPath.concat('clipboard');
		clipboardFns = (
			await caller.listObjAsync(clipboardPath)
		) as (keyof NonNullable<ShellCAPs['clipboard']>)[];
	}
	return makeShellFollowingListing(
		shellCAPs, dialogFns, clipboardFns, caller, objPath
	);
}

function makeShellFollowingListing(
	shellCAPs: (keyof ShellCAPs)[],
	dialogFns: (keyof NonNullable<ShellCAPs['fileDialogs']>)[] | undefined,
	clipboardFns: (keyof NonNullable<ShellCAPs['clipboard']>)[] | undefined,
	caller: Caller, objPath: string[]
): ShellCAPs {
	const shell: ShellCAPs = {};
	if (shellCAPs.includes('fileDialogs')) {
		const dialogsPath = objPath.concat('fileDialogs');
		shell.fileDialogs = makeFileDialogs(caller, dialogsPath, dialogFns!);
	}
	if (shellCAPs.includes('userNotifications')) {
		const notifPath = objPath.concat('userNotifications');
		shell.userNotifications = makeUserNotifications(caller, notifPath);
	}
	if (shellCAPs.includes('watchStartCmds')) {
		shell.watchStartCmds = jsonCall.makeObservableFuncCaller(
			caller, objPath.concat('watchStartCmds')
		);
	}
	if (shellCAPs.includes('getFSResource')) {
		const fnPath = objPath.concat('getFSResource');
		shell.getFSResource = makeGetFSResource(caller, fnPath);
	}
	if (shellCAPs.includes('clipboard')) {
		const clipboardPath = objPath.concat('clipboard');
		shell.clipboard = makeClipboard(caller, clipboardPath, clipboardFns!);
	}
	if (shellCAPs.includes('deviceFiles')) {
		const deviceFilesPath = objPath.concat('deviceFiles');
		shell.deviceFiles = makeDeviceFiles(caller, deviceFilesPath);
	}
	if (shellCAPs.includes('mounts')) {
		const mountsPath = objPath.concat('mounts');
		shell.mounts = makeMounts(caller, mountsPath);
	}
	([
		'getStartedCmd', 'startAppWithParams', 'openDashboard', 'openURL'
	] as (keyof ShellCAPs)[]).filter(field => shellCAPs.includes(field))
	.forEach(field => {
		shell[field] = jsonCall.makeReqRepObjCaller<ShellCAPs, keyof ShellCAPs>(caller, objPath, field) as any;
	});
	([
		'openFile', 'openFolder', 'openInMounted'
	] as (keyof ShellCAPs)[]).filter(field => shellCAPs.includes(field))
	.forEach(field => {
		shell[field] = jsonCall.makeReqRepObjCaller<ShellCAPs, keyof ShellCAPs>(caller, objPath, field, {
			findRefOf: caller.srvRefOf.bind(caller)
		}) as any;
	});
	if (shellCAPs.includes('scanUrlQR')) {
		const scanPath = objPath.concat('scanUrlQR');
		shell.scanUrlQR = jsonCall.makeReqRepFuncCaller(caller, scanPath) as NonNullable<ShellCAPs['scanUrlQR']>;
	}
	return shell;
}


Object.freeze(exports);