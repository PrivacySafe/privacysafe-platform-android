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

import { OpenURLWhitelistEntry, urlFitsFilter } from "../../../../platform/libs-common-for-impls/url-filtering";
import { stringValueType, wrapFnOnAndroidSide } from "../../runtime-ipc-via-ports";
import { makeMountException, sanitizePath, sep } from "./mounts/mount-tree";
import { Mounter } from "./mounts/user-mounts";

type FS = web3n.files.FS;
type File = web3n.files.File;

export function makeOpenFileCAP(
	capsReq: web3n.caps.ShellCAPsSetting['openFile'], getPathInFSUri: Mounter['getPathInOS']
): {
	cap: NonNullable<web3n.shell.ShellCAPs['openFile']>;
}|undefined {
	if (capsReq === 'all') {
		return { cap: f => openFile(f, getPathInFSUri) };
	} else {
		return;
	}
}

const openMountedFsPathFn = wrapFnOnAndroidSide('mounted_open_fs_path');

async function openFile(f: File, getPathInOS: Mounter['getPathInOS']): Promise<void> {
	const pathInUri = getPathInOS(f);
	if (pathInUri) {
		await openMountedFsPathFn(stringValueType.pack({ value: pathInUri }));
	} else {
		throw makeMountException({ notMounted: true });
	}
}

export function openInMountedFolderCAP(
	capsReq: web3n.caps.ShellCAPsSetting['openInMountedFolder'], getPathInOS: Mounter['getPathInOS']
): {
	cap: NonNullable<web3n.shell.ShellCAPs['openInMounted']>;
}|undefined {
	if (capsReq === 'all') {
		return { cap: (f, p) => openInMounted(f, p, getPathInOS) };
	} else {
		return;
	}
}

async function openInMounted(
	mountedFS: FS, pathInFS: string[], getPathInOS: Mounter['getPathInOS']
): Promise<void> {
	const pathOfMountedFS = getPathInOS(mountedFS);
	if (pathOfMountedFS) {
		const fullPath = sanitizePath(pathOfMountedFS.split(sep).concat(pathInFS)).join(sep);
		await openMountedFsPathFn(stringValueType.pack({ value: fullPath }));
	} else {
		throw makeMountException({ notMounted: true });
	}
}

const openExtFn = wrapFnOnAndroidSide('open_external');

export async function openExternalUrl(url: string): Promise<void> {
	await openExtFn(stringValueType.pack({ value: url }));
}

export function makeOpenURLCAP(capsReq: web3n.caps.ShellCAPsSetting['openURL']): {
	cap: NonNullable<web3n.shell.ShellCAPs['openURL']>;
}|undefined {
	if (Array.isArray(capsReq) && (capsReq.length > 0)) {
		return { cap: url => openURL(capsReq, url) };
	} else {
		return;
	}
}

async function openURL(whitelist: OpenURLWhitelistEntry[], url: string): Promise<void> {
	const urlObj = new URL(url);
	for (const entry of whitelist) {
		if (urlFitsFilter(entry, urlObj)) {
			await openExternalUrl(url);
			return;
		}
	}
}

