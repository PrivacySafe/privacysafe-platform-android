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

import type { GetAppStorage } from "../apps/live-apps";
import type { CoreDriver } from "../core";
import type { AppCAPsAndSetup, AppSetter, SiteCAPsAndSetup } from "./apps";
import type { UserAppInfo } from "./platform";

type DevAppParams = web3n.testing.config.DevAppParams;
type DevSiteParams = web3n.testing.config.DevSiteParams;

export type DevToolsAppAllowance = (appDomain: string) => boolean;

export type WrapStartupCAPs = (cap: web3n.caps.startup.W3N) => web3n.testing.StartupW3N;

export type WrapSiteCAPsAndSetup = (
	cap: SiteCAPsAndSetup
) => { w3n: web3n.testing.CommonW3N; close: () => void; };

export interface AppsRunnerForTesting {
	runStartupDevApp: (
		params: DevAppParams, addTestStandCAP: WrapStartupCAPs
	) => Promise<{ init: Promise<boolean>; }>;
	initForDirectStartup: () => ReturnType<CoreDriver['start']>;
	openApp: (appDomain: string, entrypoint?: string) => Promise<void>;
	openSite: (siteDomain: string) => Promise<void>;
	listInstalled(): Promise<UserAppInfo[]>;
	getAppStorage: (appDomain: string) => GetAppStorage;
}
export type MakeRunner = (userId: string) => AppsRunnerForTesting;

export type StartDevStartupApp = (
	params: DevAppParams, wrapStandCAP: WrapStartupCAPs
) => Promise<void>;

// export type DevSiteParamsGetter = (
// 	appDomain: string, entrypoint: string|undefined
// ) => { params: DevSiteParams; wrapCAPs: WrapSiteCAPsAndSetup; }|undefined;

// export type DevAppParamsGetter = (appDomain: string) => {
// 	params: DevAppParams;
// 	capsWrapper: WrapAppCAPsAndSetup;
// }|undefined;

export type WrapAppCAPsAndSetup = (
	entrypoint: string, cap: AppCAPsAndSetup,
	focusThisWindow: (() => Promise<void>)|undefined
) => { w3n: web3n.testing.CommonW3N; close: () => void; setApp: AppSetter; };

export interface DevApps {

	getAppParams: (appDomain: string) => {
		params: DevAppParams; capsWrapper: WrapAppCAPsAndSetup;
	}|undefined;

	getSiteParams: (
		appDomain: string, entrypoint: string|undefined
	) => { params: DevSiteParams; wrapCAPs: WrapSiteCAPsAndSetup; }|undefined;

	listAllApps(): DevAppParams[]

}
