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

import type { Notifications } from "../caps/shell/user-notifications";

type FS = web3n.files.FS;
type File = web3n.files.File;
type CmdParams = web3n.shell.commands.CmdParams;
type Clipboard = NonNullable<web3n.shell.ShellCAPs['clipboard']>;
type ScanUrlQR = NonNullable<web3n.shell.ShellCAPs['scanUrlQR']>;

export interface Mounter {

	close(): Promise<void>;

	getPathInOS(f: FS|File): string|undefined;

	mountFS(path: string[], fs: FS): void;

	mountFile(path: string[], file: File): void;

	unmountPath(path: string[]): void;

	unmountFile(file: File): void;

	unmountFolder(fs: FS): void;

}

export interface ShellCAPs {

	makeClipboardCAP?: (capsReq: web3n.caps.ShellCAPsSetting['clipboard']) => { cap: Clipboard; }|undefined;

	makeOpenFileCAP?: (
		capsReq: web3n.caps.ShellCAPsSetting['openFile'],
		getPathInOS: Mounter['getPathInOS']|undefined
	) => {
		cap: NonNullable<web3n.shell.ShellCAPs['openFile']>;
	}|undefined;

	makeOpenFolderCAP?: (
		capsReq: web3n.caps.ShellCAPsSetting['openFolder'],
		getPathInOS: Mounter['getPathInOS']|undefined
	) => {
		cap: NonNullable<web3n.shell.ShellCAPs['openFolder']>;
	}|undefined;

	makeOpenURLCAP?: (capsReq: web3n.caps.ShellCAPsSetting['openURL']) => {
		cap: NonNullable<web3n.shell.ShellCAPs['openURL']>;
	}|undefined;

	openInMountedFolderCAP?: (
		capsReq: web3n.caps.ShellCAPsSetting['openInMountedFolder'],
		getPathInOS: Mounter['getPathInOS']|undefined
	) => {
		cap: NonNullable<web3n.shell.ShellCAPs['openInMounted']>;
	}|undefined;

	makeMountsCAP?: (
		appDomain: string, capsReq: web3n.caps.ShellCAPsSetting['mounts'],
		userMounts: Mounter|undefined
	) => {
		cap: NonNullable<web3n.shell.ShellCAPs['mounts']>
	}|undefined;

	makeNotifications?: (triggerCmd: (appDomain: string, cmd: CmdParams) => Promise<void>) => Notifications;

	scanUrlQR?: ScanUrlQR;

}

