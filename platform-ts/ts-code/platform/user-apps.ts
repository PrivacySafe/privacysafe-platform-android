/*
 Copyright (C) 2016 - 2026 3NSoft Inc.
 
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

import type { PlatformResources, SignupParamsViaURL, UserAppInfo } from './inject-defs/platform';
import { reverseDomain, type CoreConf } from 'core-3nweb-client-lib';
import type { CoreDriver, makeCoreDriver, MakeUserMount } from './core';
import { Subject } from 'rxjs';
import { sleep } from './lib-common/processes/sleep';
import { NamedProcs } from './lib-common/processes/named-procs';
import { getProvidedCAPs, MAIN_GUI_ENTRYPOINT, makeRPCException } from './lib-common/manifest-utils';
import { defer } from './lib-common/processes/deferred';
import { stringifyErr } from './lib-common/exceptions/error';
import { DevApps, DevToolsAppAllowance } from './inject-defs/test-stand';
import type { Component, Service } from './inject-defs/apps';
import { Sites } from './inject-defs/sites';
import { GetAppStorage, LiveApps } from './apps/live-apps';
import type { SystemPlaces } from './caps/system/system-places';
import type { AppDownloader } from './caps/system/apps-downloader';
import { systemCAPsDomain } from './caps/rpc';
import { OtherUsersFns } from './caps/system';

type UserAppsEvents = 'start-closing' | {
	type: 'closed';
	closePlatform: boolean;
} | {
	type: 'app-installed' | 'app-downloaded';
	app: UserAppInfo;
} | {
	type: 'app-removed';
	appId: string;
};

type SysUtils = web3n.system.SysUtils;
type Apps = web3n.system.apps.Apps;
type Platform = web3n.system.platform.Platform;
type UserLoginSettings = web3n.system.UserLoginSettings;
type CmdParams = web3n.shell.commands.CmdParams;
type WritableFS = web3n.files.WritableFS;
type AppManifest = web3n.caps.AppManifest;

const platformComponentName = {
	guiPlacement: 'gui.placement'
};

export type MakeAppsAndSites = (
	findInstalledApp: SystemPlaces['findInstalledApp'],
	appAndManifestOnDev: SystemPlaces['appAndManifestOnDev'],
	makeAppCAPs: CoreDriver['makeCAPsForAppComponent'],
	getAppStorage: (appDomain: string) => GetAppStorage,
	devApps: DevApps['getAppParams']|undefined,
	makeSiteCAPs: CoreDriver['makeCAPsForSiteComponent'],
	guiPlacementFS: Promise<WritableFS>,
	userId: () => string
) => { apps: LiveApps; sites: Sites; };

export interface StartupApp {
	doWhenWindowCompletes: (handler: () => void) => void;
	focusWindow: () => void;
	close: () => void;
}

export type OpenStartupApp = (
	usersToFilterOut: string[], signupParams: SignupParamsViaURL|undefined
) => Promise<{ init: Promise<boolean>; }>;


export class UserApps {

	private readonly core: CoreDriver;
	private readonly sysPlaces: SystemPlaces;

	private startupApp: StartupApp|undefined = undefined;
	private readonly apps: LiveApps;
	private readonly capImplProviders: CAPImplementationProviders;

	// XXX sites should get similar treatment to app, but we can comment out them for now
	private readonly siteStartingProcs = new NamedProcs();
	private readonly sites: Sites;

	private readonly broadcast = new Subject<UserAppsEvents>();
	readonly event$ = this.broadcast.asObservable();

	constructor(
		makeDriver: typeof makeCoreDriver,
		conf: CoreConf,
		makeAppsAndSites: MakeAppsAndSites,
		private readonly devApps: DevApps|undefined,
		private readonly devToolsAllowance: DevToolsAppAllowance,
		otherUsersFns: ((currentUser: string) => OtherUsersFns)|undefined,
		getPlatform: () => Platform,
		makeUserMounts: MakeUserMount|undefined,
		private readonly r: PlatformResources
	) {
		this.sysPlaces = this.r.caps.makeSystemPlaces(() => this.core.storages);
		const appDownloader = this.r.caps.makeAppDownloader(this.sysPlaces);
		const makeSystemCapFns = () => systemCAPsFrom(
			this.sysPlaces,
			appDownloader,
			this.apps,
			this.openApp.bind(this),
			this.executeCommand.bind(this),
			this.triggerAllStartupLaunchers.bind(this),
			this.apps.closeAppsAfterUpdate.bind(this.apps),
			getPlatform(),
			this.getUserLoginSettings(),
			this.r.caps.makeAutoStartupCAP
		);
		this.core = makeDriver(
			conf, makeSystemCapFns,
			this.startAppWithCmd.bind(this),
			this.openAppLauncher.bind(this),
			{
				closeCurrentUserApps: () => this.closeAllApps(),
				logout: () => this.exit(),
				exitPlatform: () => this.exit(true)
			},
			otherUsersFns,
			this.getServiceToHandleCall.bind(this),
			this.getAppFSResourceFor.bind(this),
			makeUserMounts,
			this.r
		);
		const guiPlacementFS = this.core.whenReady()
		.then(() => this.sysPlaces.getPlatformComponentFS(
			'local', platformComponentName.guiPlacement
		));
		this.capImplProviders = new CAPImplementationProviders(
			this.sysPlaces.listManifestsDataOfInstalledApps.bind(this.sysPlaces),
			this.r.getSytemFormFactor, this.devApps
		);
		const { apps, sites } = makeAppsAndSites(
			this.sysPlaces.findInstalledApp.bind(this.sysPlaces),
			this.sysPlaces.appAndManifestOnDev.bind(this.sysPlaces),
			this.core.makeCAPsForAppComponent.bind(this.core),
			this.getAppStorage.bind(this),
			devApps?.getAppParams,
			this.core.makeCAPsForSiteComponent.bind(this.core),
			guiPlacementFS,
			() => this.userId
		);
		this.apps = apps;
		this.sites = sites;
		Object.seal(this);
	}

	get userId(): string {
		return this.core.getUserId();
	}

	get coreStarted(): boolean {
		return this.core.isStarted();
	}

	async listInstalled(): Promise<UserAppInfo[]> {
		const infos: UserAppInfo[] = [];
		const allApps = await this.sysPlaces.listCurrentApps();
		for (const { id } of allApps) {
			const m = await this.sysPlaces.getAppManifest(id);
			infos.push({
				id, name: (m ? m.name : id), isInstalled: true
			});
		}
		return infos;
	}

	updateWindowTitles(): void {
		this.apps.updateWindowTitles();
	}

	startCoreDirectly(): ReturnType<CoreDriver['start']> {
		return this.core.start();
	}

	startCoreDirectlyFor(userId: string, storageKey: Uint8Array): Promise<void> {
		return this.core.startCoreDirectlyFor(userId, storageKey);
	}

	async setStartupAppProcess(
		instantiate: (startCore: CoreDriver['start']) => {
			startupApp: StartupApp; startProc: Promise<void>; coreInit: Promise<void>;
		}
	): Promise<{ init: Promise<boolean>; }> {
		if (this.core.isStarted() || this.startupApp) {
			throw new Error(`Startup was already started`);
		}
		const { coreInit, startProc, startupApp } = instantiate(this.core.start.bind(this.core));
		this.startupApp = startupApp;
		await startProc;
		const windowClosed = defer<false>();
		this.startupApp.doWhenWindowCompletes(() => windowClosed.resolve(false));
		const init = Promise.race([
			coreInit.then(() => true),
			windowClosed.promise
		]);
		return { init };
	}

	closeStartupApp(): void {
		if (this.startupApp) {
			this.startupApp.close();
			this.startupApp = undefined;
		}
	}

	focusStartupWindow(): void {
		if (this.startupApp) {
			this.startupApp.focusWindow();
		}
	}

	async openApp(appDomain: string, entrypoint = MAIN_GUI_ENTRYPOINT, devTools = false): Promise<void> {
		try {
			devTools = devTools || this.devToolsAllowance(appDomain);
			const app = await this.apps.get(appDomain, devTools);
			await app.launchWebGUI(entrypoint, devTools);
		} catch (err) {
			this.r.showSystemErrorBox(
				`Fail to open App`,
				`Opening 3NWeb app ${appDomain} threw an error:${'\n'}${stringifyErr(err)}`
			);
			throw err;
		}
	}

	async executeCommand(appDomain: string, cmd: CmdParams, devTools?: boolean): Promise<void> {
		devTools = devTools || this.devToolsAllowance(appDomain);
		const app = await this.apps.get(appDomain, devTools);
		await app.handleCmdFromUser(cmd);
	}

	async openAppInProperFormFactor(appDomain: string): Promise<void> {
		try {
			const devTools = this.devToolsAllowance(appDomain);
			const app = await this.apps.get(appDomain, devTools);
			await app.launchFormFactorAppropriateWebGUI(devTools);
		} catch (err) {
			this.r.showSystemErrorBox(
				`Fail to open App`,
				`Opening 3NWeb app ${appDomain} threw an error:${'\n'}${stringifyErr(err)}`
			);
			throw err;
		}
	}

	async openAppLauncher(): Promise<void> {
		await this.openAppInProperFormFactor(this.r.LAUNCHER_APP_DOMAIN);
	}

	async doUserSystemStartup(openLauncher: boolean): Promise<void> {
		this.triggerAllStartupLaunchers();
		if (openLauncher) {
			await this.openAppLauncher();
		}
	}

	private async triggerAllStartupLaunchers(): Promise<void> {
		const lst = await this.sysPlaces.appsToLaunchOnSystemStartup();
		const startupProcs = lst.map(domain =>
			this.apps.get(domain, this.devToolsAllowance(domain))
			.then(app => app.loadOnStartup())
		);
		await Promise.all(startupProcs);
	}

	private async startAppWithCmd(
		callerApp: string, callerComponent: string,
		appDomain: string, cmd: string, ...params: any[]
	): Promise<void> {
		const app = await this.apps.get(appDomain, this.devToolsAllowance(appDomain));
		await app.handleCmd({ cmd, params }, callerApp, callerComponent);
	}

	async openSite(siteDomain: string): Promise<void> {
		const entrypoint = MAIN_GUI_ENTRYPOINT;
		if (this.sites.focusOnSiteComponentIfOpened(siteDomain, entrypoint)) {
			return;
		}

		let startedProc = this.siteStartingProcs.getP<void>(siteDomain);
		if (startedProc) {
			return startedProc;
		}

		const devParams = this.devApps?.getSiteParams(siteDomain, entrypoint);
		startedProc = (devParams ?
			this.sites.devOpenSiteComponent(devParams, entrypoint) :
			this.sites.openSiteComponent(siteDomain, entrypoint)
		);
		return this.siteStartingProcs.addStarted(siteDomain, startedProc);
	}

	private async getServiceToHandleCall(caller: Component, appDomain: string, service: string): Promise<Service> {
		if (appDomain === systemCAPsDomain) {
			return await this.getServiceToHandleCallToCAP(caller, service)
		} else {
			const app = await this.apps.get(appDomain, this.devToolsAllowance(appDomain));
			return await app.getServiceToHandleCall(caller, service);			
		}
	}

	private async getServiceToHandleCallToCAP(caller: Component, capName: string): Promise<Service> {
		const appForCAP = await this.capImplProviders.getForCAP(capName);
		if (appForCAP) {
			const app = await this.apps.get(appForCAP, this.devToolsAllowance(appForCAP));
			return await app.getProvidedCAPServiceToHandleCall(caller, capName);
		} else if (this.r.getServiceForCAP && capName.startsWith('w3n.shell.fileDialogs.')) {
			return await this.r.getServiceForCAP(caller, capName);
		} else {
			throw makeRPCException(
				systemCAPsDomain, capName,
				{ capImplementingServiceNotFound: true },
				{ callerApp: caller.domain, callerComponent: caller.entrypoint }
			);
		}
	}

	async closeAllApps(): Promise<void> {
		await this.apps.stopAndCloseAllApps();
	}

	async exit(closePlatform = false): Promise<void> {
		this.broadcast.next('start-closing');
		await this.closeAllApps();
		await this.core.close().catch(this.r.logging.logError);
		this.broadcast.next({
			type: 'closed', closePlatform
		});
		await sleep(1);
		this.broadcast.complete();
	}

	private async getAppFSResourceFor(
		resourceAppDomain: string|null|undefined, resourceName: string,
		requestingApp: string, requestingComponent: string
	): ReturnType<web3n.shell.GetFSResource> {
		if (!resourceAppDomain) {
			resourceAppDomain = requestingApp;
		}
		const app = await this.apps.get(resourceAppDomain, this.devToolsAllowance(resourceAppDomain));
		return await app.exposedFSResource(
			resourceName, requestingApp, requestingComponent
		);
	}

	getAppStorage(appDomain: string): GetAppStorage {
		return type => {
			if (type === 'local') {
				return this.core.storages.makeLocalFSForApp(
					reverseDomain(appDomain)
				);
			} else if (type === 'synced') {
				return this.core.storages.makeSyncedFSForApp(
					reverseDomain(appDomain)
				);
			} else {
				throw new Error(`Unknown storage type ${type}`);
			}
		};
	}

	async onDeviceSystemSuspend(): Promise<void> {
		await this.core.onDeviceSystemSuspend();
	}

	async onDeviceSystemResume(): Promise<void> {
		await this.core.onDeviceSystemResume();
	}

	private getUserLoginSettings(): UserLoginSettings|undefined {
		return this.r.makeUserLogin?.(
			this.core.getUserId(),
			(pass, progressCB) => this.core.getRootKey(this.userId, pass, progressCB)
		);
	}

}
Object.freeze(UserApps.prototype);
Object.freeze(UserApps);


class CAPImplementationProviders {

	private lazyCAPtoAppMap: Map<string, string|string[]>|undefined = undefined;

	constructor(
		private readonly listManifestsDataOfInstalledApps: SystemPlaces['listManifestsDataOfInstalledApps'],
		private readonly getSytemFormFactor: PlatformResources['getSytemFormFactor'],
		private readonly devApps: DevApps|undefined
	) {
		Object.seal(this);
	}

	add(appId: string, caps: string[]): void {
		if (this.lazyCAPtoAppMap) {
			for (const capName of caps) {
				this.addToMap(appId, capName);
			}
		}
	}

	private addToMap(appId: string, capName: string): void {
		const existing = this.lazyCAPtoAppMap!.get(appId);
		if (!existing) {
			this.lazyCAPtoAppMap!.set(capName, appId);
		} else if (Array.isArray(existing)) {
			existing.push(appId);
		} else {
			this.lazyCAPtoAppMap!.set(capName, [ existing, appId ]);
		}
	}

	async initMap(): Promise<void> {
		this.lazyCAPtoAppMap = new Map();
		this.devApps?.listAllApps().forEach(params => {
			const { manifest: m, formFactor } = params;
			getProvidedCAPs(m, formFactor || this.getSytemFormFactor())?.forEach(
				capName => this.addToMap(m.appDomain, capName)
			);
		});
		await this.listManifestsDataOfInstalledApps(m => {
			if (!this.devApps?.getAppParams(m.appDomain)) {
				getProvidedCAPs(m, this.getSytemFormFactor())?.forEach(capName => this.addToMap(m.appDomain, capName));
			}
		});
	}

	async getForCAP(capName: string): Promise<string|undefined> {
		if (!this.lazyCAPtoAppMap) {
			await this.initMap();
		}
		const app = this.lazyCAPtoAppMap!.get(capName);
		return (Array.isArray(app) ? app[0] : app);
	}

}
Object.freeze(CAPImplementationProviders.prototype);
Object.freeze(CAPImplementationProviders);


function systemCAPsFrom(
	sysPlaces: SystemPlaces, appDownloader: AppDownloader,
	liveApps: LiveApps,
	openApp: UserApps['openApp'],
	executeCommand: UserApps['executeCommand'],
	triggerAllStartupLaunchers: () => Promise<void>,
	closeAppsAfterUpdate: LiveApps['closeAppsAfterUpdate'],
	platform: Platform, userLogin: UserLoginSettings|undefined,
	makeAutoStartupCAP: PlatformResources['caps']['makeAutoStartupCAP']
): SysUtils {
	const apps: Apps = {
		opener: {
			listCurrentApps: sysPlaces.listCurrentApps.bind(sysPlaces),
			openApp,
			executeCommand,
			triggerAllStartupLaunchers,
			closeAppsAfterUpdate,
			getAppManifestOfCurrent: sysPlaces.getAppManifest.bind(sysPlaces),
			getAppFileBytesOfCurrent: sysPlaces.getAppFileBytes.bind(sysPlaces)
		},
		downloader: {
			downloadWebApp: appDownloader.downloadWebApp.bind(
				appDownloader
			),
			getAppChannels: appDownloader.getAppChannels.bind(
				appDownloader
			),
			getLatestAppVersion: appDownloader.getLatestAppVersion.bind(
				appDownloader
			),
			getAppVersionFilesList: appDownloader.getAppVersionFilesList.bind(
				appDownloader
			)
		},
		installer: {
			listBundledApps: sysPlaces.listBundledApps.bind(sysPlaces),
			addPackFromBundledApps: sysPlaces.addPackBundledApps.bind(sysPlaces),
			addAppPackFromFolder: sysPlaces.addAppPackFromFolder.bind(sysPlaces),
			addAppPackFromZipFile: sysPlaces.addAppPackFromZipFile.bind(sysPlaces),
			listAllAppsPacks: sysPlaces.listAllAppsPacks.bind(sysPlaces),
			listAppPacks: sysPlaces.listAppPacks.bind(sysPlaces),
			installApp: async (id, version) => {
				await sysPlaces.installApp(id, version);
				return liveApps.followupAppInstall(id, version);
			},
			removeAppPack: sysPlaces.removeAppPack.bind(sysPlaces),
			uninstallApp: async id => {
				await liveApps.closeAppToUninstall(id);
				await sysPlaces.uninstallApp(id);
			},
			removeAppData: async id => {
				await liveApps.closeAppToUninstall(id);
				await sysPlaces.removeAppData(id);
			},
			watchApps: sysPlaces.watchApps.bind(sysPlaces),
			getAppManifest: sysPlaces.getAppManifest.bind(sysPlaces),
			getAppFileBytes: sysPlaces.getAppFileBytes.bind(sysPlaces)
		}
	};
	const monitor = liveApps.makeMonitor();
	const autoStartup = makeAutoStartupCAP?.();
	return { apps, platform, monitor, userLogin, autoStartup };
}


Object.freeze(exports);