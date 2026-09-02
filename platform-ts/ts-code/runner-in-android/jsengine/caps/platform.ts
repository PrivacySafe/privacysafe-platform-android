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

import { listBundledAppPacks, listInstalledBundledApps } from "./system-places";


type BundleVersions = web3n.system.platform.BundleVersions;

export async function getCurrentVersion(): Promise<BundleVersions> {
	const bundledApps: BundleVersions['apps'] = {};
	for (const { id, version } of await listInstalledBundledApps()) {
		bundledApps[id] = version;
	}
	const bundledAppPacks: BundleVersions['app-packs'] = {};
	for (const { id, version } of await listBundledAppPacks()) {
		bundledAppPacks[id] = version;
	}
	return {
		apps: bundledApps,
		"app-packs": bundledAppPacks,
		bundle: `0.1.0+1`, // bundleVersion,
		platform: `0.1.0`, // bundleVersion.substring(0, bundleVersion.indexOf('+')),
		runtimes: {}
	};
}
