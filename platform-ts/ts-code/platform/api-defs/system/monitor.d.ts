/*
 Copyright (C) 2024 3NSoft Inc.

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

/// <reference path="../w3n.d.ts" />

/**
 * This is used by system utility launcher app, and concerns only platform
 * developers, not app developers.
 */
declare namespace web3n.system.monitor {

	interface SystemMonitor {
		listProcs(): Promise<OpenComponentInfo[]>;
		listConnectionsToAppServices(
			appId: string
		): Promise<OpenConnectionInfo[]|undefined>;
	}

	interface OpenComponentInfo {
		appId: string;
		version: string;
		entrypoint: string;
		runtime: caps.Runtime;
		numOfInstances: number;
	}

	interface OpenConnectionInfo {
		service: string;
		entrypoint: string;
		caller: {
			thisAppComponent?: string;
			otherApp?: {
				appId: string;
				component: string;
			};
		};
	}

}