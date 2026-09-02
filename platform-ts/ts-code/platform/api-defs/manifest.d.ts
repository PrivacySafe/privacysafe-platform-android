/*
 Copyright (C) 2021 - 2022, 2024 - 2026 3NSoft Inc.

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

/// <reference path="../../../node_modules/core-3nweb-client-lib/build/api-defs/common-caps.d.ts" />

declare namespace web3n.caps {

	/**
	 * Application manifest may have an explicit general form, or a simplified
	 * form for a simple app.
	 */
	type AppManifest = GeneralAppManifest | SimpleGUIAppManifest;

	interface GeneralAppManifest {
		appDomain: string;
		version: string;
		name: string;
		description: string;
		icon: string;
		/**
		 * components object enumerates all components of the app. Keys are
		 * entrypoint paths within app folder. Respective values are definitions.
		 */
		components: {
			[entrypoint: string]: AppComponent;
		};
		/**
		 * launchers is an array of explicit launchers that user can start.
		 * If this array is missing and there is a component with default
		 * entrypoint, then a default launcher is created from app's data in the
		 * manifest (name, icon, description).
		 * If there are no launchers, and there is no default component, then an
		 * app can't be launched by user directly.
		 */
		launchers?: (Launcher|DynamicLaunchers)[];
		/**
		 * launchOnSystemStartup is an array of explicit launchers that platform
		 * can start on system/platform's startup for a current user. This might
		 * be useful to warmup/preload service components.
		 */
		launchOnSystemStartup?: Launcher[];
		/**
		 * exposedFSResources object enumerates exposed file system resources.
		 * Keys are resource names. Respective values are definitions.
		 */
		exposedFSResources?: {
			[resourceName: string]: FSResourceDescriptor;
		};

		// XXX 
		// App that uses connectors (TBD) may want to provide default connector
		// settings, allowing user to start with non-empty configuration that may
		// evolve into some custom settings, e.g. Thunderbird will let one setup
		// gmail with simple parameters of user name and password, indicating
		// that technical details come from app.
		// Besides having info here, we may see json format developing to allow
		// easy passing of connectivity data from providers to their users.
		// defaultConnections?: {}[];
	}

	/**
	 * Simple app has only one implicit simgleton component, exposes no
	 * services, has no commands, and must look nice in all UI form factors.
	 * Entrypoint of an implicit component is index.html, hence, this file must
	 * exist.
	 */
	interface SimpleGUIAppManifest {
		appDomain: string;
		version: string;
		name: string;
		description: string;
		icon: string;
		windowOpts?: ui.WindowOptions;
		capsRequested?: RequestedCAPs;
		sharedLibs?: SharedLibInfo[];
	}

	/**
	 * Launcher exposes clickable things that user can start/launch. System's
	 * launcher app uses provided here info for setting up user interface. If
	 * a required runtime or forma-factor is not available on a device, launcher
	 * app can indicate it. This way an app may contain components for both
	 * desktop and mobile devices without expecting each component to be
	 * cross-platform and cross-form-factor (has this ever existed?).
	 */
	interface Launcher extends FormFactorSetting {
		/**
		 * name that will be displayed with icon.
		 * When app has several user-launchable components, different names with
		 * respective icons will help user to "click the right action".
		 */
		name: string;
		/**
		 * icon is a path to icon file within app folder.
		 */
		icon: string;
		/**
		 * component string identifies component that should be started by this
		 * launcher.
		 * Launcher can have either component, or startCmd, but not both.
		 */
		component?: string;
		/**
		 * startCmd object defines command that is invoked by this launcher.
		 * Launcher can have either component, or startCmd, but not both.
		 */
		startCmd?: shell.commands.CmdParams;
		/**
		 * description is a place to tell user what this app/launcher does.
		 */
		description: string;
	}

	interface FormFactorSetting {
		/**
		 * formFactor is a form factor filter. When present, component can be
		 * started only in enumerated user interface form factors. When filter is
		 * not set, then component can be started with any UI.
		 */
		formFactor?: UserInterfaceFormFactor|UserInterfaceFormFactor[];
	}

	/**
	 * Pointer to location with dynamically created launchers.
	 */
	interface DynamicLaunchers extends FormFactorSetting {
		/**
		 * appStorage tells in which app storage file system is located.
		 */
		appStorage: 'local'|'synced';
		/**
		 * launchersFolder is a path to launchers' folder in the app's storage.
		 */
		launchersFolder: string;
	}

	type UserInterfaceFormFactor = ui.FormFactor;

	/**
	 * File System Resource Descriptor points to file system item from app's
	 * storage that can be accessed by other apps.
	 * Resource can be a simpler option to making a service in situation of
	 * passing some static file, and broadcasting events (file system events),
	 * e.g. system-wide configurations.
	 */
	interface FSResourceDescriptor {
		/**
		 * allow tells who can access this resource.
		 */
		allow: AllowedCallers;
		/**
		 * appStorage tells in which app storage file system is located.
		 */
		appStorage: 'local'|'synced';
		/**
		 * path to file system item in the app's storage.
		 */
		path: string;
		/**
		 * itemType sets expected type of an exposed file system item.
		 */
		itemType: 'file'|'folder';
		/**
		 * initValueSrc is a path within app folder, from which resource can be
		 * initialized, if it doesn't exist, yet.
		 */
		initValueSrc?: string;
	}

	interface GUIComponent extends CommonGUIComponentSetting {
		/**
		 * startCmds object enumerates app commands that this component
		 * implements. Keys are unique command names. Respective values tell what
		 * apps/coponents are allowed to call each command.
		 */
		startCmds?: {
			[cmd: string]: AllowedCallers;
		};
		/**
		 * multiInstances is a flag to allow multiple opened instances of this
		 * component.
		 * By default every component is a singleton, i.e. launching it second
		 * time focuses an already started instance.
		 */
		multiInstances?: true;
	}

	interface ServiceComponent extends CommonComponentSetting {
		services: {
			[srv: string]: AllowedCallers;
		};
		forOneConnectionOnly?: true;
	}

	interface CAPsImplementingComponent extends CommonComponentSetting {
		capImpls: string|string[];
		forOneConnectionOnly?: true;
	}

	interface GUIServiceComponent extends ServiceComponent, CommonGUIComponentSetting {
		runtime: GUIRuntime;
		childOfGUICaller?: true;
	}

	interface CAPsImplementingGUIComponent extends CAPsImplementingComponent, CommonGUIComponentSetting {
		runtime: GUIRuntime;
		childOfGUICaller?: true;
	}

	interface CommonComponentSetting {
		runtime: Runtime;
		capsRequested?: RequestedCAPs;
		sharedLibs?: SharedLibInfo[];
	}

	interface CommonGUIComponentSetting extends CommonComponentSetting, FormFactorSetting {
		runtime: GUIRuntime;
		/**
		 * icon is a path to icon file within app folder to use for opened window.
		 * If missing, icon field from manifest is used.
		 */
		icon?: string;
		/**
		 * windowOpts are options to apply to window creation.
		 */
		windowOpts?: ui.WindowOptions;
	}

	type GUIRuntime = 'web-gui';

	type NonGUIRuntime = 'wasm,mp1' | 'deno';

	type Runtime = NonGUIRuntime | GUIRuntime;

	interface AllowedCallers {
		thisAppComponents?: '*' | string[];
		otherApps?: '*' | string[];
	}

	type AppComponent = GUIComponent |
		ServiceComponent | GUIServiceComponent |
		CAPsImplementingComponent | CAPsImplementingGUIComponent;

	interface SharedLibInfo {
		libDomain: string;
		version: { hash: string; alg: string; }
	}

	interface RequestedCAPs extends common.RequestedCAPs {
		appRPC?: string[];
		otherAppsRPC?: { app: string; service: string; }[];
		shell?: ShellCAPsSetting;
		connectivity?: ConnectivityCAPSetting;
		mediaDevices?: MediaDevicesCAPSetting;
		webrtc?: WebRTCCAPSetting;
		connectToExternal?: ExternalConnectCAPSetting;
	}

	type AppsCAPSetting = 'all' | ('opener' | 'downloader' | 'installer')[];

	interface ShellCAPsSetting {
		fileDialog?: FileDialogsCAPSettings;
		deviceFiles?: DeviceFilesCAPSettings;
		mounts?: DeviceMountFSCAPSetting;
		userNotifications?: true;
		openDashboard?: true;
		startAppCmds?: StartCmdDef;
		fsResource?: ResourcesRequest;
		openFile?: OpenFileCAPSetting;
		openFolder?: OpenFolderCAPSetting;
		openInMountedFolder?: OpenInMountedFolderCAPSetting;
		openURL?: OpenURLWhitelistEntry[];
		clipboard?: ClipboardCAPSetting;
		scanUrlQR?: true;
	}

	type FileDialogsCAPSettings = 'all' | 'readonly';

	type DeviceFilesCAPSettings = 'all';

	type DeviceMountFSCAPSetting = 'any' | 'chat' | 'mail' | 'app';

	type ConnectivityCAPSetting = 'check';

	interface ResourcesRequest {
		thisApp?: string|string[];
		otherApps?: { [ appDomain: string ]: string|string[]; };
	}

	type OpenFileCAPSetting = 'all';

	type OpenFolderCAPSetting = 'all';

	type OpenInMountedFolderCAPSetting = 'all';

	type OpenURLWhitelistEntry = {
		schema: 'https';
		anyDomain?: true;
		domain?: string;
		subdomains?: string[];
	};

	type ClipboardCAPSetting = 'all' | 'readonly' | 'writeonly';

	interface StartCmdDef extends ResourcesRequest, FormFactorSetting {}

	interface MediaDevicesCAPSetting {
		cameras?: 'all'|'select'|'use';
		microphones?: 'all'|'select'|'use';
		speakers?: 'all'|'select'|'use';
		screens?: 'all'|'select'|'use';
		windows?: 'all'|'select'|'use';
	}

	type WebRTCCAPSetting = 'all';

	interface ExternalConnectCAPSetting {
		fetch?: URLWhitelistEntry[];
	}

	interface URLWhitelistEntry {
		schema: 'https' | 'ws';
		domain: string;
		pathPrefix?: string;
	}

	interface SiteManifest {
		siteDomain: string;
		version: string;
		name: string;
		components?: {
			[entrypoint: string]: SiteComponent;
		};
	}

	interface SiteComponent {
		servedFromRemote?: true;
		subRoot?: string;
		capsRequested?: RequestedSiteCAPs;
		multiInstances?: true;
	}

	interface RequestedSiteCAPs {}

}
