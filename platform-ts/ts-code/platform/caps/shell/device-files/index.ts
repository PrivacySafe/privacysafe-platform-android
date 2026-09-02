/*
 Copyright (C) 2025 3NSoft Inc.

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

import { DeviceFS } from "core-3nweb-client-lib";
import { assert } from "../../../lib-common/assert";
import { basename, dirname } from "path";

type DeviceFiles = web3n.shell.files.DeviceFiles;

export function makeDeviceFiles(): DeviceFiles {
	return {
		standardFileToDeviceFile: async (path: any) => {
			assert(typeof path === 'string');
			const parent = await DeviceFS.makeReadonly(dirname(path));
			return await parent.readonlyFile(basename(path));
		},
		standardFileToDeviceFolder: async (path: any) => {
			assert(typeof path === 'string');
			return await DeviceFS.makeReadonly(path);
		},
		statStandardItem: async (path: any) => {
			assert(typeof path === 'string');
			const parent = await DeviceFS.makeReadonly(dirname(path));
			return await parent.stat(basename(path));
		}
	};
}

