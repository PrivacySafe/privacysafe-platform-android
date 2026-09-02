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

import { App, AppFolder } from "../../platform/apps/app";
import { GetAppStorage, LiveApps } from "../../platform/apps/live-apps";
import { SystemPlaces } from "../../platform/caps/system/system-places";
import { CoreDriver } from "../../platform/core";
import { Component, Service } from "../../platform/inject-defs/apps";
import { Logging } from "../../platform/inject-defs/confs";
import { DevApps } from "../../platform/inject-defs/test-stand";
import { getLaunchersForUser, MAIN_GUI_ENTRYPOINT, servicesImplementedBy } from "../../platform/lib-common/manifest-utils";
import { PostponedValuesFixedKeysMap } from "../../platform/lib-common/postponed-values-map";
import { defer, Deferred } from "../../platform/lib-common/processes/deferred";
import { isBundledApp } from "../jsengine/caps/system-places";
import { deviceFormFactor, STARTUP_APP_DOMAIN } from "../jsengine/confs";
import { ConnectorsAndComponents } from "./connectors-on-core-side";
import { DenoComponent } from "./deno-component";
import { GUIComponent } from "./gui-component";

type AppManifest = web3n.caps.AppManifest;
type FormFactor = web3n.ui.FormFactor;
type CmdParams = web3n.shell.commands.CmdParams;
type GUIComponentDef = web3n.caps.GUIComponent;
type SrvDef = web3n.caps.ServiceComponent;
type GUISrvDef = web3n.caps.GUIServiceComponent;
type ReadonlyFS = web3n.files.ReadonlyFS;


export class LiveAppsInAndroid extends LiveApps {

	constructor(
		getSytemFormFactor: () => FormFactor,
		private readonly findInstalledApp: SystemPlaces['findInstalledApp'],
		private readonly appAndManifestOnDev: SystemPlaces['appAndManifestOnDev'],
		private readonly makeAppCAPs: CoreDriver['makeCAPsForAppComponent'],
		getAppStorage: (appDomain: string) => GetAppStorage,
		private readonly connect: ConnectorsAndComponents['connectW3N'],
		logging: Logging
	) {
		super(deviceFormFactor, getAppStorage, undefined, logging);
		Object.seal(this);
	}

	protected async makeApp(
		appId: string,
		getAppStorage: GetAppStorage,
		removeThisFromLiveApps: () => void,
		devTools: boolean
	): Promise<App> {
		const {
			appRoot, manifest
		} = await (isBundledApp(appId) ?
			this.appAndManifestOnDev(appId) :
			this.findInstalledApp(appId)
		);
		return new AppInAndroid(
			manifest, appRoot, this.makeAppCAPs, getAppStorage, removeThisFromLiveApps, devTools, this.connect,
			this.logging
		);
	}

	protected makeDevApp(
		devAppParams: NonNullable<ReturnType<DevApps['getAppParams']>>,
		getAppStorage: GetAppStorage,
		removeThisFromLiveApps: () => void
	): Promise<App> {
		throw stub('LiveApps.makeDevApp')();
	}

	async launchAppFromAndroid(appDomain: string): Promise<ConnectorIdAndEntrypoint> {
		const devTools = false;
		if (appDomain == STARTUP_APP_DOMAIN) {
			throw `${STARTUP_APP_DOMAIN} should be started within login process`;
		}
		const app = await this.get(appDomain, devTools) as AppInAndroid;
		return await app.launchWebGUIFromAndroid(devTools);
	}

}
Object.freeze(LiveAppsInAndroid.prototype);
Object.freeze(LiveAppsInAndroid);


function stub(fnName: string) {
  return () => {
    const err = new Error(`${fnName} needs implementation`);
    console.error(err.message, "\n", err.stack);
    throw err;
  };
}


class AppInAndroid extends App {

	private readonly launchesFromAndroid = new Map<string, Deferred<ConnectorIdAndEntrypoint>>();

	constructor(
		manifest: AppManifest,
		appRoot: AppFolder,
		makeAppCAPs: CoreDriver['makeCAPsForAppComponent'],
		getAppStorage: GetAppStorage,
		removeThisFromLiveApps: () => void,
		devTools: boolean,
		private readonly connect: ConnectorsAndComponents['connectW3N'],
		logging: Logging
	) {
		super(
			manifest, appRoot, deviceFormFactor, makeAppCAPs, getAppStorage,removeThisFromLiveApps,
			devTools, undefined, logging
		);
	}

	protected async makeAndStartGUIComponentInstance(
		entrypoint: string, component: GUIComponentDef|GUISrvDef,
		startCmd: CmdParams|undefined, guiParent: GUIComponent|undefined,
		devTools?: boolean
	): Promise<GUIComponent> {
		this.appRoot
		const { appDomain } = this.manifest;
		const caps = this.capsForNewComponentInstance(
			entrypoint, component, startCmd, undefined
		);
		const services = servicesContainerFor(this.manifest, entrypoint);
		const { connectorId, setComponent } = this.connect(caps.w3n);
		const gui = new GUIComponent(connectorId, appDomain, entrypoint, caps, services);
		this.addToInstances(entrypoint, component, gui);
		setComponent({
			connectorId, appRoot: this.appRoot, entrypoint, close: gui.close.bind(gui)
		});
		const launchFromAndroid = this.launchesFromAndroid.get(entrypoint);
		if (launchFromAndroid) {
			this.launchesFromAndroid.delete(entrypoint);
			launchFromAndroid.resolve({ entrypoint, connectorId });
		} else {
			await gui.start();
		}
		return gui;
	}

	protected async makeAndStartDenoComponentInstance(entrypoint: string, component: SrvDef): Promise<Component> {
		const { appDomain } = this.manifest;
		const caps = this.capsForNewComponentInstance(entrypoint, component, undefined, undefined);
		const services = servicesContainerFor(this.manifest, entrypoint);
		const { connectorId, setComponent } = this.connect(caps.w3n);
		const deno = new DenoComponent(connectorId, appDomain, entrypoint, caps, services);
		this.addToInstances(entrypoint, component, deno);
		setComponent({
			connectorId, appRoot: this.appRoot, entrypoint, close: deno.close.bind(deno)
		});
		await deno.start();
		return deno;
	}

	async launchWebGUIFromAndroid(devTools: boolean): Promise<{ connectorId: string; entrypoint: string; }> {
		const launchers = getLaunchersForUser(this.manifest, this.getUIFF());
		let entrypoint: string;
		if (launchers) {
			const { component } = launchers[0];
			if (component) {
				entrypoint = component
			} else {
				throw new Error(`First launcher is not targeting component entrypoint for generic opening.`);
			}
		} else {
			entrypoint = MAIN_GUI_ENTRYPOINT;
		}
		const deferredLaunch = defer<ConnectorIdAndEntrypoint>()
		this.launchesFromAndroid.set(entrypoint, deferredLaunch);
		this.launchWebGUI(entrypoint, devTools)
		.catch(exc => {
			if (this.launchesFromAndroid.get(entrypoint) === deferredLaunch) {
				this.launchesFromAndroid.delete(entrypoint);
				deferredLaunch.resolve(exc);
			}
		});
		return deferredLaunch.promise;
	}

}
Object.freeze(AppInAndroid.prototype);
Object.freeze(AppInAndroid);


function servicesContainerFor(
	manifest: AppManifest, entrypoint: string
): PostponedValuesFixedKeysMap<string, Service>|undefined {
	const services = servicesImplementedBy(manifest, entrypoint);
	return (services ? new PostponedValuesFixedKeysMap(services) : undefined);
}

export interface ConnectorIdAndEntrypoint { connectorId: string; entrypoint: string; }
