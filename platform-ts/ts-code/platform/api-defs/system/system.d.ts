/*
 Copyright (C) 2024 - 2026 3NSoft Inc.

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
/// <reference path="./apps.d.ts" />
/// <reference path="./platform.d.ts" />
/// <reference path="./monitor.d.ts" />

declare namespace web3n.system {

	interface W3N extends web3n.caps.W3N {
		/**
		 * system object/namespace is used for capabilities/utilities that change
		 * user's system, e.g. installing apps, updating apps and platform.
		 * This object depends on platform's vendor choices, and will be mostly
		 * used by platform's vendor own bundled apps.
		 */
		system?: SysUtils;
	}

	interface SysUtils {

		logout?: () => Promise<void>;
		closeCurrentUserApps?: () => Promise<void>;
		exitPlatform?: () => Promise<void>;

		apps?: apps.Apps;

		platform?: platform.Platform;

		monitor?: monitor.SystemMonitor;

		otherOpenUsers?: OtherOpenUsers;

		userLogin?: UserLoginSettings;

		autoStartup?: AutoStartupSettings;

	}

	interface OtherOpenUsers {
		openLogin: () => Promise<void>;
		list: () => Promise<string[]|undefined>;
		openDashboardOf: (userId: string) => Promise<void>;
	}

	interface UserLoginSettings {
		isAutoLoginSet: () => Promise<boolean>;
		removeAutoLogin: () => Promise<void>;
		setAutoLogin: (password: string, progressCB: startup.ProgressCB) => Promise<void>;
		isAutoLoginAvailable: () => Promise<boolean>;
	}

	interface AutoStartupSettings {
		isAutoStartupAvailable: () => Promise<boolean>;
		isAutoStartupSet: () => Promise<boolean>;
		setAutoStartup: (enable: boolean) => Promise<void>;
	}

}