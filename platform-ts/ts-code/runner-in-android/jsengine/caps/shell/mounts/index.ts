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

import type { MakeUserMount } from "../../../../../platform/core";
import { makeMounting } from "./mount-tree";
import { Mounter } from "./user-mounts";

type MountsIntoOS = web3n.shell.mounts.MountsIntoOS;

export function mountIntoOS(): {
	makeUserMount: MakeUserMount;
	unmount: () => Promise<void>;
	exposeMountedFsFnsToAndroid: () => void;
} {
	const { getOrMakeUserMounts, exposeMountedFsFnsToAndroid } = makeMounting();
	return {
		makeUserMount: getOrMakeUserMounts,
		unmount: async () => {},
		exposeMountedFsFnsToAndroid
	};
}

export function makeMountsCAP(
	appDomain: string, capsReq: web3n.caps.ShellCAPsSetting['mounts'], userMounts: Mounter|undefined
): {
	cap: NonNullable<web3n.shell.ShellCAPs['mounts']>
}|undefined {
	if (!userMounts) {
		return;
	} else if (capsReq) {
		const cap = makeCAP(appDomain, capsReq, userMounts);
		if (cap) {
			return { cap };
		} else {
			return;
		}
	} else {
		return;
	}
}

function makeCAP(
	appDomain: string, section: NonNullable<web3n.caps.DeviceMountFSCAPSetting>, userMounts: Mounter
): MountsIntoOS|undefined {
	switch (section) {
		case 'any':
			return {
				mountFile: async (p, f) => userMounts.mountFile(p, f),
				mountFolder: async (p, f) => userMounts.mountFS(p, f),
				unmountPath: async p => userMounts.unmountPath(p),
				unmountFile: async f => userMounts.unmountFile(f),
				unmountFolder: async f => userMounts.unmountFolder(f)
			};
		case 'app':
			return mountsInSection(['apps', appDomain], userMounts);
		case 'mail':
			return mountsInSection(['mail'], userMounts);
		case 'chat':
			return mountsInSection(['chat'], userMounts);
		default:
			return;
	}
}

function mountsInSection(pathPrefix: string[], userMounts: Mounter): MountsIntoOS {
	return {
		mountFile: async (p, f) => userMounts.mountFile(pathPrefix.concat(p), f),
		mountFolder: async (p, f) => userMounts.mountFS(pathPrefix.concat(p), f),
		unmountPath: async p => userMounts.unmountPath(pathPrefix.concat(p)),
		unmountFile: async f => userMounts.unmountFile(f),
		unmountFolder: async f => userMounts.unmountFolder(f)
	};
}


Object.freeze(exports);