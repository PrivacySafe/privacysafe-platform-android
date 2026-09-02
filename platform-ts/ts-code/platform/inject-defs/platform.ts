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

import type { Core, makeCryptor, MakeNet, ServiceLocatorMaker } from "core-3nweb-client-lib";
import type { ShellCAPs } from "./caps";
import type { Logging } from "./confs";
import type { AppSetter, Component, Service } from "./apps";
import type { SystemPlaces } from "../caps/system/system-places";
import type { AppDownloader } from "../caps/system/apps-downloader";
import type { AsyncRNG } from "core-3nweb-client-lib/build/lib-common/rng-def";

export interface SignupParamsViaURL {
	signupUrl: string;
	isStandardService?: true;
	token: string|undefined;
}

export interface UserAppInfo {
	name: string;
	id: string;
	isInstalled: boolean;
	isDevApp?: true;
}

type ProgressCB = web3n.startup.ProgressCB;

export interface UserLogin {
	isAutoLoginSet(): Promise<boolean>;
	removeAutoLogin(): Promise<void>;
	setAutoLogin(password: string, progressCB: ProgressCB): Promise<void>;
	isAutoLoginAvailable(): Promise<boolean>;
}

export type GetKeyFromPass = (pass: string, progressCB: ProgressCB) => Promise<Uint8Array|undefined>;

type UI = web3n.ui.UI;
type W3N = web3n.caps.W3N;
type RequestedCAPs = web3n.caps.RequestedCAPs;
type ConnectivityCAP = web3n.connectivity.Connectivity;
type FormFactor = web3n.ui.FormFactor;
type FSItem = web3n.files.FSItem;

export interface CAPsImpls {

	makeAutoStartupCAP?: () => web3n.system.AutoStartupSettings;

	makeSystemPlaces: (getStorages: Core['getStorages']) => SystemPlaces;

	makeAppDownloader: (sysPalces: SystemPlaces) => AppDownloader;

	shell: ShellCAPs;

	makeUICap: () => UI;

	makeMediaDevicesCAP?: (mediaDevReq: RequestedCAPs['mediaDevices']) => {
		cap: NonNullable<W3N['mediaDevices']>; setApp: AppSetter; close: () => void;
	}|undefined;

	makeConnectivity?: (connectivityEvents: Promise<Core['connectivityEvents']>) => {
		makeCAP: () => { cap: ConnectivityCAP; }; close: () => void;
	}

}

export interface PlatformResources {

	caps: CAPsImpls;

	logging: Logging;

	showSystemErrorBox: (title: string, content: string) => void;

	LAUNCHER_APP_DOMAIN: string;

	makeUserLogin?: (userId: string, getKeyFromPass: GetKeyFromPass) => UserLogin;

	makeCryptor: makeCryptor;

	random: AsyncRNG;

	makeServiceLocator: ServiceLocatorMaker;

	makeNetClient: MakeNet;

	getSytemFormFactor: () => FormFactor;

	sysFilesOnDevice: () => Promise<FSItem>;

	getServiceForCAP?: (caller: Component, capName: string) => Promise<Service>;

}

