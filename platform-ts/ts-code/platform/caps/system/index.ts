/*
 Copyright (C) 2020 - 2024 3NSoft Inc.
 
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

type W3N = web3n.system.W3N;
type SysUtils = web3n.system.SysUtils;
type Apps = web3n.system.apps.Apps;
type Platform = web3n.system.platform.Platform;
type SystemMonitor = web3n.system.monitor.SystemMonitor;
type UserLogin = web3n.system.UserLoginSettings;
type AutoStartup = web3n.system.AutoStartupSettings;
type RequestedCAPs = web3n.system.RequestedCAPs;

export interface TurnOffFns {
	logout: () => Promise<void>;
	closeCurrentUserApps: () => Promise<void>;
	exitPlatform: () => Promise<void>;
}

export type OtherUsersFns = () => {
	openLogin: () => Promise<void>;
	list: () => Promise<string[]|undefined>;
	openDashboardOf: (userId: string) => Promise<void>;
};

export function makeSystemCAP(
	makeSystemCapFns: () => SysUtils,
	turnOffFns: TurnOffFns,
	otherUsersFns: OtherUsersFns|undefined,
	sysReq: RequestedCAPs['system']
): W3N['system'] {
	if (!sysReq) {
		return;
	}
	const systemCapFns = makeSystemCapFns();
	const apps = makeAppsCAP(systemCapFns.apps!, sysReq);
	const platform = makePlatformCAP(systemCapFns.platform!, sysReq);
	const monitor = makeSystemMonitorCAP(systemCapFns.monitor!, sysReq);
	const logoutCAPs = makeLogoutCAPs(turnOffFns, sysReq);
	const otherOpenUsers = makeOtherUsersCAP(otherUsersFns, sysReq);
	const userLogin = makeSystemUserLoginCAP(systemCapFns.userLogin!, sysReq);
	const autoStartup = makeAutoStartupCAP(systemCapFns.autoStartup!, sysReq);
	return {
		closeCurrentUserApps: logoutCAPs?.closeCurrentUserApps,
		logout: logoutCAPs?.logout,
		exitPlatform: logoutCAPs?.exitPlatform,
		otherOpenUsers,
		apps,
		platform,
		monitor,
		userLogin,
		autoStartup
	};
}

function makeAppsCAP(
	appsCapFns: Apps, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['apps'] {
	if (sysReq.apps === 'all') {
		return appsCapFns;
	} else if (sysReq.apps) {
		const apps: SysUtils['apps'] = {};
		const appsReq = sysReq.apps;
		if (Array.isArray(appsReq)) {
			for (const key of appsReq) {
				apps[key] = appsCapFns[key] as any;
			}
		} else if ((typeof appsReq === 'string') && appsCapFns[appsReq]) {
			const key = appsReq as any;
			apps[key] = appsCapFns[key] as any;
		}
		return ((Object.keys(apps).length > 0) ? apps : undefined);
	}
}

function makePlatformCAP(
	platCapFns: Platform, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['platform'] {
	if (sysReq.platform === 'all') {
		return platCapFns;
	}
}

function makeSystemMonitorCAP(
	sysMonCapFns: SystemMonitor, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['monitor'] {
	if (sysReq.monitor === 'all') {
		return sysMonCapFns;
	}
}

function makeLogoutCAPs(
	turnOffFns: TurnOffFns, sysReq: NonNullable<RequestedCAPs['system']>
): TurnOffFns|undefined {
	if (sysReq.logout === true) {
		return turnOffFns;
	}
}

function makeOtherUsersCAP(
	otherUsersFns: OtherUsersFns|undefined, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['otherOpenUsers'] {
	if (!otherUsersFns) {
		return;
	}
	if (sysReq.otherOpenUsers === 'all') {
		return otherUsersFns();
	}
}

function makeSystemUserLoginCAP(
	sysMonCapFns: UserLogin, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['userLogin'] {
	if (sysReq.monitor === 'all') {
		return sysMonCapFns;
	}
}

function makeAutoStartupCAP(
	sysAutoStartupCapFns: AutoStartup, sysReq: NonNullable<RequestedCAPs['system']>
): SysUtils['autoStartup'] {
	if (sysReq.monitor === 'all') {
		return sysAutoStartupCapFns;
	}
}


Object.freeze(exports);