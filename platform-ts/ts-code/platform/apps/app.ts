/*
 Copyright (C) 2022 - 2024, 2026 3NSoft Inc.
 
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

import { getAllGUIComponents, getComponentForCommand, getComponentForService, getWebGUIComponent, isCallerAllowed, isMultiInstanceComponent, makeRPCException, makeShellCmdException, getComponentsForSystemStartup, getExposedFSResource, makeAppFSResourceException, getComponent, getLaunchersForUser, MAIN_GUI_ENTRYPOINT, getComponentForServiceProvidingCAP, getProvidedCAPs } from "../lib-common/manifest-utils";
import { NamedProcs } from "../lib-common/processes/named-procs";
import { assert } from "../lib-common/assert";
import { wrapWithTimeout } from "../lib-common/processes/timeouts";
import { AppCAPsAndSetup, Component, GUIComponent, Service } from "../inject-defs/apps";
import { makeAppInitExc } from "../caps/shell";
import type { GetAppStorage } from "./live-apps";
import type { CoreDriver } from "../core";
import { Logging } from "../inject-defs/confs";
import { PostponedValuesFixedKeysMap } from "../lib-common/postponed-values-map";
import type { WrapAppCAPsAndSetup } from "../inject-defs/test-stand";


type ReadonlyFS = web3n.files.ReadonlyFS;
type WritableFS = web3n.files.WritableFS;
type AppManifest = web3n.caps.AppManifest;
type AppComponentDef = web3n.caps.AppComponent;
type CommonDef = web3n.caps.CommonComponentSetting;
type Runtime = web3n.caps.Runtime;
type CmdParams = web3n.shell.commands.CmdParams;
type GUIComponentDef = web3n.caps.GUIComponent;
type SrvDef = web3n.caps.ServiceComponent;
type GUISrvDef = web3n.caps.GUIServiceComponent;
type CAPsImplDef = web3n.caps.CAPsImplementingComponent;
type GUICAPsImplDef = web3n.caps.CAPsImplementingGUIComponent;
type FileException = web3n.files.FileException;
type GetFSResource = web3n.shell.GetFSResource;
type OpenConnectionInfo = web3n.system.monitor.OpenConnectionInfo;
type FormFactor = web3n.ui.FormFactor;
type W3N = web3n.caps.W3N;

export abstract class App {

	/**
	 * array is used for components that are multi-instance, even if there is
	 * only one instance at the moment
	 */
	private readonly instances = new Map<string, Component|Set<Component>>();
	/**
	 * entrypoints are id's of processes that change number of components
	 */
	private readonly startProcs = new NamedProcs();
	private canStartComponents = true;


	protected constructor(
		protected readonly manifest: AppManifest,
		protected readonly appRoot: AppFolder,
		protected readonly getUIFF: () => FormFactor,
		protected readonly makeAppCAPs: CoreDriver['makeCAPsForAppComponent'],
		private readonly getAppStorage: GetAppStorage,
		private readonly removeThisFromLiveApps: () => void,
		protected devTools: boolean,
		protected readonly devCAPsWrapper: WrapAppCAPsAndSetup|undefined,
		protected readonly logging: Logging
	) {
		if (!this.devTools && this.devCAPsWrapper) {
			this.devTools = true;
		}
	}

	async handleCmd(cmd: CmdParams, callerApp: string, callerComponent: string): Promise<void> {
		const { entrypoint, component } = this.componentForCmd(cmd.cmd);
		this.ensureCmdCallerIsAllowed(
			component, cmd.cmd, callerApp, callerComponent
		);
		await this.whenNoStartProc(entrypoint);
		const existing = this.instances.get(entrypoint) as GUIComponent;
		if (existing && !isMultiInstanceComponent(component)) {
			this.ensureCmdHandlePresence(existing, cmd.cmd);
			existing.cmdsHandler!.handle(cmd, callerApp, callerComponent);
			existing.focusWindow();
			return;
		}
		await this.syncStartProc(entrypoint, this.makeAndStartGUIComponentInstance(
			entrypoint, component, cmd, undefined
		));
	}

	private componentForCmd(cmd: string): {
		component: GUIComponentDef; entrypoint: string;
	} {
		const c = getComponentForCommand(this.manifest, cmd, this.getUIFF());
		if (c) {
			return c;
		} else {
			throw makeShellCmdException(this.manifest.appDomain, cmd, {
				cmdNotFound: true
			});
		}
	}

	private ensureCmdCallerIsAllowed(
		component: GUIComponentDef, cmd: string, callerApp: string, callerComponent: string
	): void {
		const appDomain = this.manifest.appDomain;
		if (!isCallerAllowed(appDomain, component.startCmds![cmd], callerApp, callerComponent)) {
			throw makeShellCmdException(appDomain, cmd, {
				callerNotAllowed: true
			});
		}
	}

	private ensureCmdHandlePresence(existing: GUIComponent, cmd: string): void {
		if (!existing.cmdsHandler!.canHandleCmd(cmd)) {
			throw makeShellCmdException(this.manifest.appDomain, cmd, {
				cause: `Command handler is not found on implementation`
			});
		}
	}	

	private async syncStartProc<T>(entrypoint: string, proc: Promise<T>): Promise<T> {
		proc = proc.catch(err => {
			this.logging.logError(err, `Error thrown when starting component ${entrypoint} of app ${this.appId}`);
			throw err;
		});
		return wrapWithTimeout(
			this.startProcs.addStarted(entrypoint, proc),
			10000,
			() => `Timeout reached in starting ${this.manifest.appDomain}${entrypoint}`
		)
	}

	private async whenNoStartProc(entrypoint: string): Promise<void> {
		while (this.startProcs.getP(entrypoint)) {
			await this.startProcs.getP(entrypoint);
		}
	}

	private ensureCanStartComponent(): void {
		if (!this.canStartComponents) {
			throw new Error(`Can't start component, cause app is closed`);
		}
	}

	protected capsForNewComponentInstance(
		entrypoint: string, component: AppComponentDef, startCmd: CmdParams|undefined,
		focusThisWindow: (() => Promise<void>)|undefined
	): ReturnType<CoreDriver['makeCAPsForAppComponent']> {
		this.ensureCanStartComponent();
		const { appDomain, version } = this.manifest;
		let caps = this.makeAppCAPs(appDomain, version, entrypoint, component, startCmd);
		if (this.devCAPsWrapper) {
			caps = this.devCAPsWrapper(entrypoint, caps, focusThisWindow);
		}
		return caps;
	}

	async handleCmdFromUser(cmd: CmdParams): Promise<void> {
		const { entrypoint, component } = this.componentForCmd(cmd.cmd);
		await this.whenNoStartProc(entrypoint);
		const existing = this.instances.get(entrypoint) as GUIComponent;
		if (existing && !isMultiInstanceComponent(component)) {
			this.ensureCmdHandlePresence(existing, cmd.cmd);
			existing.cmdsHandler!.handleFromUser(cmd);
			existing.focusWindow();
			return;
		}
		await this.syncStartProc(
			entrypoint,
			this.makeAndStartGUIComponentInstance(
				entrypoint, component, cmd, undefined, this.devTools
			)
		);
	}

	async launchWebGUI(entrypoint: string, devTools: boolean): Promise<void> {
		const component = getWebGUIComponent(this.manifest, entrypoint);
		if (devTools) {
			this.devTools = true;
		}
		await this.launchComponent(entrypoint!, component);
	}

	async launchFormFactorAppropriateWebGUI(devTools: boolean): Promise<void> {
		const launchers = getLaunchersForUser(this.manifest, this.getUIFF());
		if (launchers) {
			const { component, startCmd } = launchers[0];
			if (component) {
				return await this.launchWebGUI(component, devTools);
			} else if (startCmd) {
				return await this.handleCmdFromUser(startCmd);
			}
		}
		await this.launchWebGUI(MAIN_GUI_ENTRYPOINT, devTools);
	}

	private async launchComponent(entrypoint: string, component: AppComponentDef): Promise<void> {
		await this.whenNoStartProc(entrypoint);
		const existing = this.instances.get(entrypoint);
		if (existing && !isMultiInstanceComponent(component)) {
			(existing as GUIComponent)?.focusWindow?.();
			return;
		}
		if (component.runtime === 'web-gui') {
			await this.syncStartProc(entrypoint, this.makeAndStartGUIComponentInstance(
				entrypoint, component as GUIComponentDef, undefined, undefined, this.devTools
			));
		} else if (component.runtime === 'deno') {
			await this.syncStartProc(entrypoint, this.makeAndStartDenoComponentInstance(entrypoint, component));

		}
	}

	async loadOnStartup(): Promise<void> {
		const toStart = getComponentsForSystemStartup(this.manifest)
		if (!toStart) {
			return;
		}
		for (const { entrypoint, component } of toStart) {
			await this.launchComponent(entrypoint!, component)
			.catch(err=> this.logging.appLog('error', this.appId, `Fail to start on system startup`, err));
		}
	}

	protected abstract makeAndStartGUIComponentInstance(
		entrypoint: string, component: GUIComponentDef|GUISrvDef|GUICAPsImplDef,
		startCmd: CmdParams|undefined, guiParent: GUIComponent|undefined,
		devTools?: boolean
	): Promise<GUIComponent>;

	protected addToInstances(entrypoint: string, component: AppComponentDef, instance: Component): void {
		if (isMultiInstanceComponent(component as GUIComponentDef)) {
			let set = this.instances.get(entrypoint) as Set<Component>|undefined;
			if (set) {
			} else {
				set = new Set();
				this.instances.set(entrypoint, set);
			}
			set.add(instance);
		} else {
			assert(!this.instances.has(entrypoint));
			this.instances.set(entrypoint, instance);
		}
		instance.setCloseListener(
			() => this.removeFromInstances(entrypoint, instance)
		);
	}

	private removeFromInstances(entrypoint: string, instance: Component): void {
		let slotValue = this.instances.get(entrypoint);
		if (!slotValue) {
			return;
		} else if (slotValue === instance) {
			this.instances.delete(entrypoint);
		} else {
			(slotValue as Set<Component>).delete(instance);
			if ((slotValue as Set<Component>).size === 0) {
				this.instances.delete(entrypoint);
			}
		}
		if ((this.instances.size === 0) && !this.startProcs.hasProcs()) {
			this.stopAndClose();
		}
	}

	async getProvidedCAPServiceToHandleCall(caller: Component, capName: string): Promise<Service> {
		const appDomain = this.manifest.appDomain;
		const c = getComponentForServiceProvidingCAP(this.manifest, capName, this.getUIFF());
		if (!c) {
			throw makeRPCException(appDomain, capName, { capImplementingServiceNotFound: true });
		}
		const { entrypoint, component } = c;
		return await this.getOrMakeServiceInstaceForCall(caller, component, entrypoint, capName);
	}

	async getServiceToHandleCall(caller: Component, service: string): Promise<Service> {
		const appDomain = this.manifest.appDomain;
		const c = getComponentForService(this.manifest, service, this.getUIFF());
		if (!c) {
			throw makeRPCException(appDomain, service, { serviceNotFound: true });
		}
		const { entrypoint, component } = c;
		if (!isCallerAllowed(
			appDomain, component.services[service],
			caller.domain, caller.entrypoint
		)) {
			throw makeRPCException(
				appDomain, service,
				{ callerNotAllowed: true },
				{ callerApp: caller.domain, callerComponent: caller.entrypoint }
			);
		}
		return await this.getOrMakeServiceInstaceForCall(caller, component, entrypoint, service);
	}

	private async getOrMakeServiceInstaceForCall(
		caller: Component, component: SrvDef|CAPsImplDef, entrypoint: string, service: string
	): Promise<Service> {
		await this.whenNoStartProc(entrypoint);
		const existing = this.instances.get(entrypoint);
		if (existing && !isMultiInstanceComponent(component)) {
			(existing as GUIComponent).focusWindow?.();
			return (existing as Component).getService(service);
		}
		return await this.syncStartProc(
			entrypoint,
			this.makeAndStartServiceComponentInstance(
				caller, service, component, entrypoint
			).then(c => c.getService(service))
		);
	}

	private async makeAndStartServiceComponentInstance(
		caller: Component, service: string, component: SrvDef|CAPsImplDef, entrypoint: string
	): Promise<GUIComponent|Component> {
		this.ensureCanStartComponent();
		const appDomain = this.manifest.appDomain;
		if (component.runtime === 'web-gui') {
			const parent = ((
				(caller.runtime === 'web-gui') &&
				(component as GUISrvDef).childOfGUICaller) ?
				caller as GUIComponent : undefined
			);
			return this.makeAndStartGUIComponentInstance(entrypoint, component as GUISrvDef, undefined, parent);
		} else if (component.runtime === 'deno') {
			return this.makeAndStartDenoComponentInstance(entrypoint, component);
		} else if (component.runtime === 'wasm,mp1') {
			// XXX
			throw new Error(`Starting ${component.runtime} component is not implemented, yet.`);
		} else {
			throw makeAppInitExc(appDomain, {}, {
				entrypoint, service,
				message: `Runtime '${component.runtime}' is unknown`
			});
		}

	}

	protected abstract makeAndStartDenoComponentInstance(
		entrypoint: string, component: SrvDef|CAPsImplDef
	): Promise<Component>;

	get version(): string {
		return this.manifest.version;
	}

	get appId(): string {
		return this.manifest.appDomain;
	}

	updateTitlesOnGUIComponents(): void {
		for (const {
			entrypoint, component
		} of getAllGUIComponents(this.manifest)) {
			this.instances.get(entrypoint)
		}
	}

	get isClosed(): boolean {
		return !this.canStartComponents;
	}

	async stopAndClose(): Promise<void> {
		this.canStartComponents = false;
		this.removeThisFromLiveApps();
		for (const inst of this.instances.values()) {
			if ((inst as Component).close) {
				(inst as Component).close();
			} else {
				for (const c of (inst as Set<Component>)) {
					c.close();
				}
			}
		}
	}

	async exposedFSResource(
		resourceName: string, requestingApp: string, requestingComponent: string
	): ReturnType<GetFSResource> {
		const {
			appStorage, itemType, path, initValueSrc
		} = getExposedFSResource(this.manifest, resourceName, requestingApp, requestingComponent);
		const fs = await this.getAppStorage(appStorage);
		if (itemType === 'file') {
			return await fs.readonlyFile(path)
			.catch(async (exc: FileException) => {
				if (!exc.notFound) {
					throw exc;
				} else if (!initValueSrc) {
					throw makeAppFSResourceException(
						this.manifest.appDomain, resourceName,
						requestingApp, requestingComponent, {
							resourceNotInitialized: true
						}
					);
				}
				await this.syncFsInitProc(
					resourceName,
					() => copyFile(this.appRoot, initValueSrc, fs, path)
				);
				return fs.readonlyFile(path);
			});
		} else if (itemType === 'folder') {
			return await fs.readonlySubRoot(path)
			.catch(async (exc: FileException) => {
				if (!exc.notFound) {
					throw exc;
				} else if (!initValueSrc) {
					throw makeAppFSResourceException(
						this.manifest.appDomain, resourceName, requestingApp, requestingComponent,
						{ resourceNotInitialized: true }
					);
				}
				await this.syncFsInitProc(
					resourceName,
					() => copyFolder(this.appRoot, initValueSrc, fs, path)
				);
				return fs.readonlySubRoot(path);
			});
		} else {
			throw new Error(`Unknown fs resource type ${itemType}`);
		}
	}

	private syncFsInitProc(resourceName: string, action: () => Promise<void>): Promise<void> {
		const procId = `init-fs-resource:${resourceName}`;
		const proc = this.startProcs.getP(procId) as Promise<void>|undefined;
		return (proc ? proc : this.startProcs.startOrChain(procId, action));
	}

	/**
	 * Info list of open instances of this app's components.
	 */
	get openInstances(): {
		entrypoint: string; runtime: Runtime; numOfInstances: number;
	}[] {
		return Array.from(this.instances.entries())
		.map(([ entrypoint, compOrSet]) => ({
			entrypoint,
			runtime: getComponent(this.manifest, entrypoint).runtime,
			numOfInstances: ((compOrSet as Component).domain ?
				1 : (compOrSet as Set<Component>).size
			)
		}));
	}

	/**
	 * Info list of open connection to this app's services.
	 * If this app has no exposed services, undefined is returned.
	 */
	get openSrvConnections(): OpenConnectionInfo[]|undefined {
		let info: OpenConnectionInfo[]|undefined = undefined;
		for (const compOrSet of this.instances.values()) {
			if (!compOrSet) {
				return;
			} else if ((compOrSet as Component).domain) {
				const conns = (compOrSet as Component).listServiceConnections();
				if (conns) {
					if (!info) {
						info = conns;
					} else if (conns.length > 0) {
						info.push(...conns);
					}
				}
			} else {
				for (const component of (compOrSet as Set<Component>)) {
					const conns = component.listServiceConnections();
					if (conns) {
						if (!info) {
							info = conns;
						} else if (conns.length > 0) {
							info.push(...conns);
						}
					}
				}
			}
		}
		return info;
	}

}
Object.freeze(App.prototype);
Object.freeze(App);


export interface AppFolder {
	readBytes: ReadonlyFS['readBytes'];
	listFolder: ReadonlyFS['listFolder'];
	checkFilePresence: ReadonlyFS['checkFilePresence'];
	getByteSource: ReadonlyFS['getByteSource'];
}

async function copyFile(
	src: AppFolder, srcPath: string, dst: WritableFS, dstPath: string
): Promise<void> {
	const bytes = await src.readBytes(srcPath);
	await dst.writeBytes(dstPath, (bytes ? bytes : new Uint8Array(0)));
}

async function copyFolder(
	src: AppFolder, srcPath: string, dst: WritableFS, dstPath: string
): Promise<void> {
	const lst = await src.listFolder(srcPath);
	await dst.makeFolder(dstPath);
	for (const { name, isFile, isFolder } of lst) {
		if (isFile) {
			await copyFile(src, `${srcPath}/${name}`, dst, `${dstPath}/${name}`);
		} else if (isFolder) {
			await copyFolder(src, `${srcPath}/${name}`, dst, `${dstPath}/${name}`);
		} else {
			throw new Error(`${srcPath}/${name} for initial fs resource value is neither file, nor folder`);
		}
	}
}


export abstract class AppComponentBase implements Component {

	protected constructor(
		public readonly runtime: CommonDef['runtime'],
		public readonly domain: string,
		public readonly entrypoint: string,
		protected readonly services: PostponedValuesFixedKeysMap<string, Service>|undefined,
	) {}

	abstract start(): Promise<void>;
	abstract setCloseListener(onClose: () => void): void;
	abstract close(): void;

	listServiceConnections(): OpenConnectionInfo[]|undefined {
		return this.services?.values().flatMap(
			srv => srv.listOpenConnections(this.entrypoint)
		);
	}

	addService(name: string, service: Service): void {
		if (!this.services) {
			throw new Error(`Component is not expected to implement any services`);
		}
		this.services.set(name, service);
	}

	getService(name: string): Promise<Service> {
		if (!this.services) {
			throw new Error(`Component is not expected to implement any services`);
		}
		return this.services.get(name);
	}

}
