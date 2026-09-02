/*
 Copyright (C) 2021 - 2022, 2024, 2026 3NSoft Inc.
 
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

import { getStackHere, makeRuntimeException } from './exceptions/runtime';

type AppManifest = web3n.caps.AppManifest;
type GeneralAppManifest = web3n.caps.GeneralAppManifest;
type SimpleGUIAppManifest = web3n.caps.SimpleGUIAppManifest;
type GUIComponentDef = web3n.caps.GUIComponent;
type ServiceComponent = web3n.caps.ServiceComponent;
type CAPsImplementingComponent = web3n.caps.CAPsImplementingComponent;
type GUIServiceComponent = web3n.caps.GUIServiceComponent;
type AppComponent = web3n.caps.AppComponent;
type AllowedCallers = web3n.caps.AllowedCallers;
type LauncherDef = web3n.caps.Launcher;
type DynamicLaunchers = web3n.caps.DynamicLaunchers;
type RPCException = web3n.rpc.RPCException;
type ShellCmdException = web3n.shell.commands.ShellCmdException;
type FSResourceDescriptor = web3n.caps.FSResourceDescriptor;
type FSResourceException = web3n.shell.FSResourceException;
type ResourcesRequest = web3n.caps.ResourcesRequest;
type UserInterfaceFormFactor = web3n.caps.UserInterfaceFormFactor;
type FormFactorSetting = web3n.caps.FormFactorSetting;


export interface AppManifestException extends web3n.RuntimeException {
	type: 'app-manifest',
	domain: string;
	componentNotFound?: true;
	entrypoint?: string;
	wrongComponentType?: true;
	serviceNotFound?: true;
	service?: string;
	commandNotFound?: true;
	command?: string;
}

export async function checkAppManifest(
	manifest: AppManifest, appDomain: string, version: string
): Promise<void> {
	if (manifest.appDomain !== appDomain) {
		throw makeAppManifestException(undefined, {}, {
			message: `Domain value ${manifest.appDomain} in manifest doesn't match expected value ${appDomain}`
		});
	}
	if (manifest.version !== version) {
		throw makeAppManifestException(manifest.appDomain, {}, {
			message: `Version value ${manifest.version} in manifest doesn't match expected value ${version}`
		});
	}
	if ((manifest as GeneralAppManifest).components) {
		ensureComponentsSettings((manifest as GeneralAppManifest).components);
	}
}

function ensureComponentsSettings(
	components: GeneralAppManifest['components']
): void {

	// XXX do an exhaustive check of components


}

function isSimpleGUIAppManifest(m: AppManifest): boolean {
	return !(m as GeneralAppManifest).components;
}

export const MAIN_GUI_ENTRYPOINT = '/index.html';

export function getWebGUIComponent(
	m: AppManifest, entrypoint: string
): GUIComponentDef {
	const component = getComponent(m, entrypoint) as GUIComponentDef;
	if (component.runtime !== 'web-gui') {
		throw makeAppManifestException(
			m.appDomain, { wrongComponentType: true }, {
				entrypoint,
				message: `Runtime is ${component.runtime} instead of expected 'web-gui'`
			}
		);
	}
	return component;
}

export function getComponent(
	m: AppManifest, entrypoint: string
): AppComponent {
	if (isSimpleGUIAppManifest(m)) {
		if (entrypoint !== MAIN_GUI_ENTRYPOINT) {
			throw makeAppManifestException(
				m.appDomain, { componentNotFound: true }, { entrypoint }
			);
		}
		return makeComponentForSimpleGUIApp(m);
	}

	const component = (m as GeneralAppManifest).components[entrypoint] as GUIComponentDef;
	if (!component) {
		throw makeAppManifestException(
			m.appDomain, { componentNotFound: true }, { entrypoint }
		);
	}

	if (!component.icon && m.icon) {
		component.icon = m.icon;
	}

	return component;
}

function makeComponentForSimpleGUIApp(
	m: SimpleGUIAppManifest
): GUIComponentDef {
	return {
		runtime: 'web-gui',
		capsRequested: (m as SimpleGUIAppManifest)['capsRequested'],
		windowOpts: m['windowOpts'],
		icon: m.icon
	};
}

/**
 * Collects app's launchers that can be started directly by user.
 * @param m app's manifest
 * @param formFactor a form factor filter
 * @returns an array of launcher, or undefined if there's none defined
 */
export function getLaunchersForUser(
	m: AppManifest, formFactor: UserInterfaceFormFactor
): LauncherDef[]|undefined {
	const manifestLauncher = (m as GeneralAppManifest).launchers;
	if (Array.isArray(manifestLauncher)) {
		let lst = (manifestLauncher
		.filter(l => !(l as DynamicLaunchers).appStorage) as LauncherDef[])
		.filter(l => (l.component || l.startCmd))
		.filter(l => isApplicableToFormFactor(l, formFactor));
		return ((lst && (lst.length > 0)) ? lst : undefined);
	} else {
		return [ getDefaultLauncher(m) ];
	}
}

function isApplicableToFormFactor(
	def: FormFactorSetting, currentFormFactor: UserInterfaceFormFactor
): boolean {
	if (!def.formFactor) {
		return true;
	} else if (Array.isArray(def.formFactor)) {
		return !!def.formFactor.find(ff => isCompatibleFormFactor(ff, currentFormFactor));
	} else {
		return isCompatibleFormFactor(def.formFactor, currentFormFactor);
	}
}

function isCompatibleFormFactor(
	ff: UserInterfaceFormFactor, neededFF: UserInterfaceFormFactor
): boolean {
	if (ff === neededFF) {
		return true;
	}
	switch (ff) {
		case 'phone+screen':
		case 'tablet+screen':
			return (neededFF === 'desktop');
		default:
			return false;
	}
}

export function getDynamicLaunchersLocations(
	m: AppManifest
): DynamicLaunchers[]|undefined {
	const manifestLauncher = (m as GeneralAppManifest).launchers;
	if (Array.isArray(manifestLauncher)) {
		let lst = (manifestLauncher
		.filter(l => !!(l as DynamicLaunchers).appStorage) as DynamicLaunchers[]);
		return ((lst && (lst.length > 0)) ? lst : undefined);
	} else {
		return;
	}
}

export function getDefaultLauncher(m: AppManifest): LauncherDef {
	return (isSimpleGUIAppManifest(m) ?
		makeLauncherForSimpleGUIApp(m as SimpleGUIAppManifest) :
		makeLauncherForGeneralAppManifest(m as GeneralAppManifest)
	);
}

function makeLauncherForSimpleGUIApp(m: SimpleGUIAppManifest): LauncherDef {
	return {
		component: MAIN_GUI_ENTRYPOINT,
		icon: m.icon,
		name: m.name,
		description: m.description
	};
}

function makeLauncherForGeneralAppManifest(m: GeneralAppManifest): LauncherDef {
	if (m.launchers && (m.launchers.length > 0)) {
		throw makeAppManifestException(m.appDomain, {}, {
			message: `${m.appDomain} manifest already has launcher, and one of those should be used.`
		});
	}
	if (!m.components[MAIN_GUI_ENTRYPOINT]) {
		throw makeAppManifestException(m.appDomain, {}, {
			message: `${m.appDomain} manifest has no component '${MAIN_GUI_ENTRYPOINT}' that can be used with a default launcher.`
		});
	}
	return {
		component: MAIN_GUI_ENTRYPOINT,
		icon: m.icon,
		name: m.name,
		description: m.description
	};
}

export function getComponentForCommand(
	m: AppManifest, cmd: string, currentFormFactor: UserInterfaceFormFactor
): { entrypoint: string; component: GUIComponentDef; }|undefined {
	if (!(m as GeneralAppManifest).components) {
		return;
	}
	for (const [entrypoint, def] of Object.entries(
		(m as GeneralAppManifest).components
	)) {
		const cmdDef = (def as GUIComponentDef).startCmds?.[cmd];
		if (cmdDef && isApplicableToFormFactor(def as GUIComponentDef, currentFormFactor)) {
			return { entrypoint, component: def as GUIComponentDef };
		}
	}
	return;	// explicit undefined return
}

export function getComponentForService(
	m: AppManifest, service: string, currentFormFactor: UserInterfaceFormFactor
): { entrypoint: string; component: ServiceComponent; }|undefined {
	if (!(m as GeneralAppManifest).components) {
		return;
	}
	for (const [entrypoint, def] of Object.entries((m as GeneralAppManifest).components)) {
		const srvDef = (def as ServiceComponent).services?.[service];
		if (srvDef && isApplicableToFormFactor(def as GUIServiceComponent, currentFormFactor)) {
			return { entrypoint, component: def as ServiceComponent };
		}
	}
	return;	// explicit undefined return
}

export function getComponentForServiceProvidingCAP(
	m: AppManifest, capName: string, currentFormFactor: UserInterfaceFormFactor
): { entrypoint: string; component: CAPsImplementingComponent; }|undefined {
	if (!(m as GeneralAppManifest).components) {
		return;
	}
	for (const [entrypoint, def] of Object.entries((m as GeneralAppManifest).components)) {
		const capImpls = (def as CAPsImplementingComponent).capImpls;
		if (capImpls
		&& (Array.isArray(capImpls) ? capImpls.includes(capName) : (capImpls === capName))
		&& isApplicableToFormFactor(def as GUIServiceComponent, currentFormFactor)) {
			return { entrypoint, component: def as CAPsImplementingComponent };
		}
	}
	return;	// explicit undefined return
}

export function getProvidedCAPs(m: AppManifest, currentFormFactor: UserInterfaceFormFactor): string[]|undefined {
	if (!(m as GeneralAppManifest).components) {
		return;
	}
	const caps: string[] = [];
	for (const [entrypoint, def] of Object.entries((m as GeneralAppManifest).components)) {
		const capImpls = (def as CAPsImplementingComponent).capImpls;
		if (capImpls && isApplicableToFormFactor(def as GUIServiceComponent, currentFormFactor)) {
			if (Array.isArray(capImpls)) {
				caps.push(...capImpls);
			} else {
				caps.push(capImpls);
			}
		}
	}
	return ((caps.length === 0) ? undefined : caps);
}

export function getAllGUIComponents(
	m: AppManifest
): { entrypoint: string; component: GUIComponentDef|GUIServiceComponent; }[] {
	if (isSimpleGUIAppManifest(m)) {
		return [ {
			entrypoint: MAIN_GUI_ENTRYPOINT,
			component: makeComponentForSimpleGUIApp(m)
		} ];
	}
	const lst: ReturnType<typeof getAllGUIComponents> = [];
	for (const [ entrypoint, c ] of Object.entries(
		(m as GeneralAppManifest).components
	)) {
		if (c.runtime === 'web-gui') {
			lst.push({ entrypoint, component: c as GUIComponentDef|GUIServiceComponent });
		}
	}
	return lst;
}

export function isCallerAllowed(
	appDomain: string, conf: AllowedCallers,
	callerApp: string, callerComponent: string
): boolean {
	if (conf && (typeof conf === 'object')) {
		if (appDomain === callerApp) {
			if (Array.isArray(conf.thisAppComponents)) {
				if (conf.thisAppComponents.includes(callerComponent)) {
					return true;
				}
			} else if (conf.thisAppComponents === '*') {
				return true;
			}
		} else {
			if (Array.isArray(conf.otherApps)) {
				if (conf.otherApps.includes(callerApp)) {
					return true;
				}
			} else if (conf.otherApps === '*') {
				return true;
			}
		}
	}
	return false;
}

export function isMultiInstanceComponent(c: AppComponent): boolean {
	if ((c as GUIComponentDef).multiInstances) {
		return true;
	} else if ((c as ServiceComponent).forOneConnectionOnly) {
		return true;
	} else {
		return false;
	}
}

export function servicesImplementedBy(
	m: AppManifest, entrypoint: string
): string[]|undefined {
	if (isSimpleGUIAppManifest(m)) {
		return;
	}
	const c = (m as GeneralAppManifest).components[entrypoint];
	if (!c) {
		return;
	}
	let services = ((c as ServiceComponent).services ?
		Array.from(Object.keys((c as ServiceComponent).services)) : undefined
	);
	const capImpls = (c as CAPsImplementingComponent).capImpls;
	if (capImpls) {
		if (Array.isArray(capImpls)) {
			if (services) {
				services.push(...capImpls);
			} else {
				services = capImpls;
			}
		} else {
			if (services) {
				services.push(capImpls);
			} else {
				services = [ capImpls ];
			}
		}
	}
	return ((!services || (services.length === 0)) ? undefined : services);
}

export function makeRPCException(
	appDomain: string, service: string, flags: Partial<RPCException>,
	params?: Partial<RPCException>
): RPCException {
	if (params) {
		params.appDomain = appDomain;
		params.service = service;
	} else {
		params = { appDomain, service };
	}
	return makeRuntimeException('rpc', params, flags);
}

export function makeShellCmdException(
	appDomain: string, command: string,
	flags: Partial<ShellCmdException>, params?: Partial<ShellCmdException>
): ShellCmdException {
	if (params) {
		params.appDomain = appDomain;
		params.command = command;
	} else {
		params = { appDomain, command };
	}
	return makeRuntimeException('shell-command', params, flags);
}

export function makeAppFSResourceException(
	resourceAppDomain: string, resourceName: string,
	requestingAppDomain: string, requestingComponent: string,
	flags: Partial<FSResourceException>, params?: Partial<FSResourceException>
): FSResourceException {
	if (params) {
		params.requestingAppDomain = requestingAppDomain;
		params.requestingComponent = requestingComponent;
		params.resourceAppDomain = resourceAppDomain;
		params.resourceName = resourceName;
	} else {
		params = {
			requestingAppDomain, requestingComponent,
			resourceAppDomain, resourceName
		};
	}
	return makeRuntimeException('fs-resource', params, flags);
}

function makeAppManifestException(
	appDomain: string|undefined,
	flags: Partial<AppManifestException>, params?: Partial<AppManifestException>
): AppManifestException {
	if (params) {
		params.domain = appDomain;
	} else {
		params = { domain: appDomain };
	}
	return makeRuntimeException('app-manifest', params, flags);

}

export function hasStartupLaunchersDefined(m: AppManifest): boolean {
	const { launchOnSystemStartup } = (m as GeneralAppManifest);
	return (
		Array.isArray(launchOnSystemStartup) &&
		(launchOnSystemStartup.length > 0)
	);
}

export function getComponentsForSystemStartup(
	m: AppManifest
): { entrypoint: string; component: AppComponent; }[]|undefined {
	const { components, launchOnSystemStartup } = (m as GeneralAppManifest);
	const lst = launchOnSystemStartup?.filter(c => !!c.component)
	.map(({ component: entrypoint }) => ({
		entrypoint: entrypoint!,
		component: components[entrypoint!]
	}));
	return ((lst && (lst.length > 0)) ? lst : undefined);
}

export function getExposedFSResource(
	m: AppManifest, resourceName: string,
	requestingApp: string, requestingComponent: string
): FSResourceDescriptor {
	const { appDomain, exposedFSResources } = m as GeneralAppManifest
	const descriptor = exposedFSResources?.[resourceName];
	if (!descriptor) {
		throw makeAppFSResourceException(
			appDomain, resourceName, requestingApp, requestingComponent, {
				resourceNotFound: true
			}
		);
	}
	if (isCallerAllowed(
		appDomain, descriptor.allow, requestingApp, requestingComponent
	)) {
		return descriptor;
	} else {
		throw makeAppFSResourceException(
			appDomain, resourceName, requestingApp, requestingComponent, {
				notAllowed: true
			}
		);
	}
}

export function isResourceInRequest(
	request: ResourcesRequest, appDomain: string|undefined|null, resource: string
): boolean {
	const resources = (!appDomain ?
		request.thisApp : request.otherApps?.[appDomain]
	);
	return (Array.isArray(resources) ?
		resources.includes(resource) : (resources === resource)
	);
}

export function externalHostsToConnect(component: ServiceComponent|CAPsImplementingComponent): string[]|undefined {
	const lst = component.capsRequested?.connectToExternal?.fetch?.map(conn => conn.domain)
	.filter(d => (d.length > 0));
	return ((lst && (lst.length > 0)) ? lst : undefined);
}
