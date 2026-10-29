/*
 Copyright (C) 2020 - 2026 3NSoft Inc.
 
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

import { Core, CoreConf } from "core-3nweb-client-lib";
import { GetServiceToHandleNewCall, makeClientSideConnector, ClientSideConnector } from "../caps/rpc/index";
import { Deferred, defer } from "../lib-common/processes/deferred";
import { StartAppWithCmd } from "../caps/shell/cmd-invocation";
import { GetAppFSResourceFor } from "../caps/shell/fs-resource";
import { makeRpcCAP } from "../caps/rpc";
import { connectivityCAP } from "../caps/connectivity/connectivity";
import { makeSystemCAP, OtherUsersFns, TurnOffFns } from "../caps/system";
import { makeShellCAPs } from "../caps/shell";
import { NOTIFICATIONS_SYSTEM_COMPONENT, SYSTEM_DOMAIN } from "../inject-defs/confs";
import { AppSetter, Component, makeCAPsSetAppAndCloseFns, SiteCAPsAndSetup } from "../inject-defs/apps";
import { Mounter } from "../inject-defs/caps";
import { Notifications } from "../caps/shell/user-notifications";
import { PlatformResources } from "../inject-defs/platform";

type SysUtils = web3n.system.SysUtils;
type AppComponent = web3n.caps.AppComponent;
type SiteComponent = web3n.caps.SiteComponent;
type CmdParams = web3n.shell.commands.CmdParams;
type W3N = web3n.system.W3N;
type SitesW3N = web3n.caps.sites.W3N;
type GUIComponentDef = web3n.caps.GUIComponent;
type OpenDashboard = web3n.shell.OpenDashboard;
type ProgressCB = web3n.startup.ProgressCB;

export type MakeUserMount = (userId: string) => Promise<Mounter>;
export type MakeTestStandMount = () => Promise<Mounter>;

export function makeCoreDriver(
	conf: CoreConf, makeSystemCapFns: () => SysUtils,
	startAppWithCmd: StartAppWithCmd, openDashboard: OpenDashboard,
	turnOffFns: TurnOffFns, otherUsersFns: ((currentUserId: string) => OtherUsersFns)|undefined,
	getService: GetServiceToHandleNewCall, getAppFSResourceFor: GetAppFSResourceFor,
	makeUserMounts: MakeUserMount|undefined, r: PlatformResources
): CoreDriver {
	return new CoreDriver(
		conf, makeSystemCapFns, startAppWithCmd, openDashboard, turnOffFns, otherUsersFns,
		getService, getAppFSResourceFor, makeUserMounts, r
	);
}

export class CoreDriver {

	private readonly core: Core;
	private signedUser: string|undefined = undefined;
	private readonly rpcClientSide: ClientSideConnector;
	private readonly userNotifications: Notifications|undefined;
	private readonly connectivity: ReturnType<NonNullable<PlatformResources['caps']['makeConnectivity']>>|undefined;
	private coreReady: Deferred<void>|undefined = defer();
	private fsMounts: Mounter|undefined = undefined;

	constructor(
		conf: CoreConf,
		private readonly makeSystemCapFns: () => SysUtils,
		private readonly startAppWithCmd: StartAppWithCmd,
		private readonly openDashboard: OpenDashboard,
		private readonly turnOffFns: TurnOffFns,
		private readonly otherUsersFns: ((currentUserId: string) => OtherUsersFns)|undefined,
		getService: GetServiceToHandleNewCall,
		private readonly getAppFSResourceFor: GetAppFSResourceFor,
		makeUserMounts: MakeUserMount|undefined,
		private readonly r: PlatformResources
	) {
		this.core = Core.make(
			conf,
			this.r.makeNetClient,
			this.r.makeServiceLocator,
			this.r.sysFilesOnDevice,
			this.r.makeCryptor,
			this.r.random
		);
		this.rpcClientSide = makeClientSideConnector(getService);
		this.userNotifications = this.r.caps.shell.makeNotifications?.(
			(appDomain, { cmd, params }) => this.startAppWithCmd(
				SYSTEM_DOMAIN, NOTIFICATIONS_SYSTEM_COMPONENT, appDomain, cmd, ...params
			)
		);
		this.connectivity = this.r.caps.makeConnectivity?.(this.whenReady().then(() => this.core.connectivityEvents));
		this.coreReady!.promise.then(async () => {
			try {
				this.fsMounts = await makeUserMounts?.(this.signedUser!);
			} catch (exc) {
				this.r.logging.logError(exc, `Fail to mount user`);
			}
		}).catch(noop);
		Object.seal(this);
	}

	async close(): Promise<void> {
		this.connectivity?.close();
		this.userNotifications?.close();
		await this.fsMounts?.close().catch(this.r.logging.logError);
		await this.core.close().catch(this.r.logging.logError);
	}

	start(
		saveStorageKeyForAutologin?: (storageKey: Uint8Array) => void
	): { capsForStartup: web3n.startup.W3N; coreInit: Promise<void>; } {
		if (!this.core) { throw new Error(`Core is already closed`); }
		const { capsForStartup, coreInit, coreAppsInit } = this.core.start(saveStorageKeyForAutologin);
		return {
			capsForStartup,
			coreInit: coreInit.then(
				userId => this.doAfterInit(userId, coreAppsInit),
				err => {
					this.coreReady?.reject(err);
					throw err;
				}
			)
		};
	}

	async startCoreDirectlyFor(userId: string, storageKey: Uint8Array): Promise<void> {
		if (!this.core) { throw new Error(`Core is already closed`); }
		const procStarted = await this.core.startDirectlyFromCache(userId, storageKey);
		if (!procStarted) {
			throw `Is storage key correct?`;
		}
		const { coreInit } = procStarted;
		await coreInit;
		this.doAfterInit(userId);
	}

	async getRootKey(user: string, pass: string, progressCB: ProgressCB): Promise<Uint8Array|undefined> {
		if (!this.core) { throw new Error(`Core is already closed`); }
		return this.core.getRootKey(user, pass, progressCB);
	}

	async whenReady(): Promise<void> {
		if (this.coreReady) {
			await this.coreReady.promise;
		}
	}

	// XXX we should set core ready before coreAppsInit settles, our it should give 

	private async doAfterInit(userId: string, coreAppsInit?: Promise<void>): Promise<void> {
		this.signedUser = userId;
		this.userNotifications?.setUserId(this.signedUser);

		// XXX change this wait to something else for test stand, as it needs await
		// may be runner in stand should be aware of events, tec.

		await coreAppsInit;
		if (this.coreReady) {
			this.coreReady.resolve();
			this.coreReady = undefined;
		}
	}

	isStarted(): boolean {
		return !!this.signedUser;
	}

	getUserId(): string {
		if (this.signedUser) {
			return this.signedUser;
		} else {
			throw new Error(`Core is not initialized`);
		}
	}

	get storages() {
		if (!this.core) { throw new Error(`Core is already closed`); }
		return this.core.getStorages();
	}

	makeCAPsForAppComponent(
		appDomain: string, appVersion: string, component: string,
		componentDef: AppComponent, startCmd: CmdParams|undefined
	): { w3n: W3N; close: () => void; setApp: AppSetter; } {
		if (!this.core) { throw new Error(`Core is already closed`); }
		const capsReq = componentDef.capsRequested ?? {};
		const baseW3N = this.core.makeCAPsForApp(appDomain, capsReq);
		const { log, keyrings, mail, mailerid, storage } = baseW3N.caps;
		const closeSelf = this.closeSelfCAP();
		const shell = makeShellCAPs(
			appDomain, component, capsReq,
			(componentDef as GUIComponentDef).startCmds, startCmd,
			this.getAppFSResourceFor,
			this.userNotifications,
			this.startAppWithCmd,
			this.openDashboard,
			this.fsMounts,
			this.rpcClientSide,
			this.r.caps.shell
		);
		const rpc = makeRpcCAP(this.rpcClientSide, appDomain, componentDef, capsReq);
		const mediaDevices = this.r.caps.makeMediaDevicesCAP?.(capsReq.mediaDevices);
		const connectivity = (this.connectivity ?
			connectivityCAP(capsReq.connectivity, this.connectivity) : undefined
		);
		const { close, setApp } = makeCAPsSetAppAndCloseFns(
			shell, rpc, mediaDevices, baseW3N, closeSelf
		);
		const w3n: W3N = {
			log, keyrings, mail, mailerid, storage,
			myVersion: async () => appVersion,
			ui: this.r.caps.makeUICap(),
			closeSelf: closeSelf.cap,
			system: makeSystemCAP(
				this.makeSystemCapFns,
				this.turnOffFns,
				this.otherUsersFns?.(this.signedUser!),
				(capsReq as web3n.system.RequestedCAPs).system
			),
			shell: shell?.cap,
			rpc: rpc?.cap,
			connectivity: connectivity?.cap,
			mediaDevices: mediaDevices?.cap,
		};
		return { w3n, close, setApp };
	}

	makeCAPsForSiteComponent(
		siteDomain: string, component: string, componentDef: SiteComponent
	): SiteCAPsAndSetup {
		const w3n: SitesW3N = {};
		return { w3n };
	}

	private closeSelfCAP(): { cap: W3N['closeSelf']; setApp: AppSetter; } {
		let self: Component = undefined as any;
		const cap: W3N['closeSelf'] = () => {
			if (self) {
				self.close();
			}
		};
		const setApp: AppSetter = app => { self = app; };
		return { cap, setApp };
	}

	async onDeviceSystemSuspend(): Promise<void> {
		await this.core.onDeviceSystemSuspend();
	}

	async onDeviceSystemResume(): Promise<void> {
		await this.core.onDeviceSystemResume();
	}

}
Object.freeze(CoreDriver.prototype);
Object.freeze(CoreDriver);


function noop() {}

export function autologinFromStartup(): {
	saveUserKey: (storageKey: Uint8Array) => void;
	getUserKeyForAutologin: () => Uint8Array|undefined;
	enableAutologin: (enable: boolean) => Promise<void>;
} {
	let userKeyForAutoLogin: Uint8Array|undefined = undefined;
	let setupAutologin = false;

	return {
		saveUserKey: storageKey => {
			if (setupAutologin) {
				userKeyForAutoLogin = storageKey;
			}
		},
		enableAutologin: async enable => {
			setupAutologin = enable;
		},
		getUserKeyForAutologin: () => userKeyForAutoLogin
	};
}


Object.freeze(exports);
