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

import { makeAppCmdsCaller, makeCmdsHandler } from "./cmd-invocation";
import { GetAppFSResourceFor, getFSResourceCAP } from "./fs-resource";
import { CoreDriver } from "../../core";
import { makeDeviceFiles } from "./device-files";
import { AppSetter, CAPsSetupFns, GUIComponent, makeCAPsSetAppAndCloseFns } from "../../inject-defs/apps";
import { makeRuntimeException } from "../../lib-common/exceptions/runtime";
import { ShellCAPs } from "../../inject-defs/caps";
import type { ClientSideConnector } from "../rpc/index";
import { makeCAPconnector } from "../rpc";

type W3N = web3n.caps.W3N;
type GUIComponentDef = web3n.caps.GUIComponent;
type RequestedCAPs = web3n.caps.RequestedCAPs;
type CmdParams = web3n.shell.commands.CmdParams;
type CmdHandlerDef = NonNullable<GUIComponentDef['startCmds']>;
type AppInitException = web3n.system.apps.AppInitException;

export function makeShellCAPs(
	appDomain: string, component: string, capsReq: RequestedCAPs,
	cmdHandlerDef: GUIComponentDef['startCmds'],
	startCmd: CmdParams|undefined,
	getAppFSResourceFor: GetAppFSResourceFor,
	userNotificationsImpl: CoreDriver['userNotifications'],
	startAppWithCmd: CoreDriver['startAppWithCmd'],
	openDashboardFn: CoreDriver['openDashboard'],
	userMounts: CoreDriver['fsMounts'],
	rpcClientSide: ClientSideConnector,
	r: ShellCAPs
): {
	cap: NonNullable<W3N['shell']>; setApp: AppSetter; close: () => void;
}|undefined {
	if (!capsReq.shell && !cmdHandlerDef) { return; }
	const cap: NonNullable<W3N['shell']> = {};
	const capsSetupFns: CAPsSetupFns[] = [];
	if (capsReq.shell) {
		const fileDialogs = fileDialogShellCAP(capsReq.shell.fileDialog, rpcClientSide);
		if (fileDialogs) {
			cap.fileDialogs = fileDialogs.cap;
			capsSetupFns.push(fileDialogs);
		}
		const deviceFiles = deviceFilesShellCAP(capsReq.shell.deviceFiles);
		if (deviceFiles) {
			cap.deviceFiles = deviceFiles.cap;
		}
		const userNotifications = (userNotificationsImpl ?
			makeUserNotificationsShellCAP(appDomain, component, capsReq.shell.userNotifications, userNotificationsImpl) :
			undefined
		);
		if (userNotifications) {
			cap.userNotifications = userNotifications.cap;
			capsSetupFns.push(userNotifications);
		}
		const startAppWithParamsShell = startAppWithParamsShellCAP(
			appDomain, component, capsReq.shell.startAppCmds,
			startAppWithCmd
		);
		if (startAppWithParamsShell) {
			cap.startAppWithParams = startAppWithParamsShell.cap;
		}
		const getFSResource = getFSResourceCAP(
			appDomain, component, capsReq.shell.fsResource,
			getAppFSResourceFor
		);
		if (getFSResource) {
			cap.getFSResource = getFSResource.cap;
		}
		const openDashboard = makeDashboardOpenerCAP(
			capsReq.shell.openDashboard, openDashboardFn
		);
		if (openDashboard) {
			cap.openDashboard = openDashboard.cap;
		}
		const clipboard = r.makeClipboardCAP?.(capsReq.shell.clipboard);
		if (clipboard) {
			cap.clipboard = clipboard.cap;
		}
		const getPathInOS = userMounts?.getPathInOS.bind(userMounts);
		const openFolder = r.makeOpenFolderCAP?.(capsReq.shell.openFolder, getPathInOS);
		if (openFolder) {
			cap.openFolder = openFolder.cap;
		}
		const openFile = r.makeOpenFileCAP?.(capsReq.shell.openFile, getPathInOS);
		if (openFile) {
			cap.openFile = openFile.cap;
		}
		const openInMounted = r.openInMountedFolderCAP?.(capsReq.shell.openInMountedFolder, getPathInOS);
		if (openInMounted) {
			cap.openInMounted = openInMounted.cap;
		}
		const openURL = r.makeOpenURLCAP?.(capsReq.shell.openURL);
		if (openURL) {
			cap.openURL = openURL.cap;
		}
		const scanUrlQR = makeScanUrlQRCAP(capsReq.shell.scanUrlQR, r.scanUrlQR);
		if (scanUrlQR) {
			cap.scanUrlQR = scanUrlQR.cap;
		}
	}
	if (cmdHandlerDef) {
		const capFns = makeCmdHandlerCAP(appDomain, cmdHandlerDef, startCmd);
		cap.getStartedCmd = capFns.getStartedCmd;
		cap.watchStartCmds = capFns.watchStartCmds;
		capsSetupFns.push(capFns);
	}
	const mounts = r.makeMountsCAP?.(appDomain, capsReq.shell?.mounts, userMounts);
	if (mounts) {
		cap.mounts = mounts.cap;
	}
	if (Object.keys(cap).length > 0) {
		const { close, setApp } = makeCAPsSetAppAndCloseFns(...capsSetupFns);
		return { cap, close, setApp };
	}
}

function makeUserNotificationsShellCAP(
	appDomain: string, component: string,
	notifCAPsReq: web3n.caps.ShellCAPsSetting['userNotifications'],
	userNotifications: NonNullable<CoreDriver['userNotifications']>
): {
	cap: web3n.shell.notifications.UserNotifications;
	close: () => void;
}|undefined {
	if (!notifCAPsReq) { return; }
	const { notifications: cap, close } = userNotifications.makeFor(appDomain, component);
	return { cap, close };
}

function startAppWithParamsShellCAP(
	appDomain: string, component: string,
	capsReq: web3n.caps.ShellCAPsSetting['startAppCmds'],
	startAppWithCmd: CoreDriver['startAppWithCmd']
): {
	cap: web3n.shell.ShellCAPs['startAppWithParams'];
}|undefined {
	if (!capsReq?.otherApps && !capsReq?.thisApp) { return; }
	return {
		cap: makeAppCmdsCaller(
			startAppWithCmd, appDomain, component, capsReq
		)
	};
}

function fileDialogShellCAP(
	fileDialogCAPsReq: web3n.caps.ShellCAPsSetting['fileDialog'],
	rpcClientSide: ClientSideConnector
): {
	cap: web3n.shell.files.Dialogs; setApp: AppSetter; close(): void;
}|undefined {
	if (!fileDialogCAPsReq) { return; }
	const capsSetupFns: CAPsSetupFns[] = [];
	function makeFDialogCAP(capName: string) {
		const capFns = makeCAPconnector(capName, rpcClientSide);
		capsSetupFns.push(capFns);
		return capFns.cap;
	}
	if (fileDialogCAPsReq === 'all') {
		const cap: web3n.shell.files.Dialogs = {
			openFileDialog: makeFDialogCAP('w3n.shell.fileDialogs.openFileDialog') as any,
			openFolderDialog: makeFDialogCAP('w3n.shell.fileDialogs.openFolderDialog') as any,
			saveFileDialog: makeFDialogCAP('w3n.shell.fileDialogs.saveFileDialog') as any,
			saveFolderDialog: makeFDialogCAP('w3n.shell.fileDialogs.saveFolderDialog') as any
		};
		const { close, setApp } = makeCAPsSetAppAndCloseFns(...capsSetupFns);
		return { cap, close, setApp };
	} else if (fileDialogCAPsReq ===  'readonly') {
		const cap: web3n.shell.files.Dialogs = {
			openFileDialog: makeFDialogCAP('w3n.shell.fileDialogs.openFileDialog') as any,
			openFolderDialog: makeFDialogCAP('w3n.shell.fileDialogs.openFolderDialog') as any
		};
		const { close, setApp } = makeCAPsSetAppAndCloseFns(...capsSetupFns);
		return { cap, close, setApp };
	}
}

function deviceFilesShellCAP(
	deviceFilesCAPsReq: web3n.caps.ShellCAPsSetting['deviceFiles']
): {
	cap: web3n.shell.files.DeviceFiles;
}|undefined {
	if (!deviceFilesCAPsReq) { return; }
	if (deviceFilesCAPsReq === 'all') {
		return {
			cap: makeDeviceFiles()
		};
	}
}

function makeCmdHandlerCAP(
	appDomain: string, cmdHandlerDef: CmdHandlerDef,
	startCmd: CmdParams|undefined
): {
	getStartedCmd: NonNullable<web3n.shell.ShellCAPs['getStartedCmd']>;
	watchStartCmds: NonNullable<web3n.shell.ShellCAPs['watchStartCmds']>;
	setApp: AppSetter;
} {
	const cmdHandler = makeCmdsHandler(appDomain, cmdHandlerDef);
	return {
		getStartedCmd: async () => startCmd,
		watchStartCmds: obs => {
			const sub = cmdHandler.cmd$.subscribe(obs);
			return () => sub.unsubscribe();
		},
		setApp: app => {
			if (!cmdHandlerDef) {
				// XXX add some proper app
				throw new Error(``);
			}
			(app as GUIComponent).setCmdHandler(cmdHandler);
		}
	};
}

function makeDashboardOpenerCAP(
	capsReq: web3n.caps.ShellCAPsSetting['openDashboard'],
	openDashboard: () => Promise<void>
): {
	cap: NonNullable<web3n.shell.ShellCAPs['openDashboard']>;
}|undefined {
	if (capsReq === true) {
		return { cap: openDashboard };
	}
}

export function makeAppInitExc(
	appDomain: string, flags: Partial<AppInitException>,
	params?: Partial<AppInitException>
): AppInitException {
	if (params) {
		params.appDomain = appDomain;
	} else {
		params = { appDomain };
	}
	return makeRuntimeException<AppInitException>('app-init', params, flags);
}

function makeScanUrlQRCAP(
	capsReq: web3n.caps.ShellCAPsSetting['scanUrlQR'],
	impl: web3n.shell.ShellCAPs['scanUrlQR']
): {
	cap: NonNullable<web3n.shell.ShellCAPs['scanUrlQR']>;
}|undefined {
	if (impl && capsReq) {
		return { cap: impl };
	}
}


Object.freeze(exports);