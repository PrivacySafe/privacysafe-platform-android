/*
 Copyright (C) 2021 - 2025 3NSoft Inc.

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

/**
 * This is used by system utility launcher app, and concerns only platform
 * developers, not app developers. Nonetheless, app developers have a standard
 * for distributing apps via http, and it necessarily reflects in the api here.
 */
declare namespace web3n.system.apps {

	/**
	 * Apps CAP allows opening apps and modification of what is installed in
	 * "user's system".
	 * 
	 * User's system's synchronized storage has standard system folders:
	 *  - 'App&Lib Packs' contains packs/folders with different apps' versions.
	 *  - 'Apps Code' is a folder from which app's components' code is loaded to
	 *    run in respective runtimes. Every app can have only one version
	 *    "installed". And "install" is implemented by linking a respective
	 *    app version from packs into code folders tree.
	 * 
	 * In addition, platform distribution can come with bundled zipped app packs
	 * that simplify first time system setup.
	 * Platform also comes with unzipped bundled apps for startup and launcher,
	 * but, these two apps are updated together with the platform, being an
	 * interface to the platform before user signs in, and right after.
	 */
	interface Apps {
		/**
		 * opener of apps can list and gather info about apps in user's system.
		 */
		opener?: AppsOpener;
		/**
		 * downloader has methods to download apps from the network.
		 */
		downloader?: AppsDownloader;
		/**
		 * installer adds and removes apps into user's system.
		 */
		installer?: AppsInstaller;
	}

	interface AppsOpener {
		/**
		 * This lists currently installed apps.
		 */
		listCurrentApps(): Promise<{ id: string; version: string; }[]>;

		/**
		 * This returns a manifest of a current installed app version.
		 * Undefined is returned if given app is not linked as currently installed.
		 * @param id identifies app.
		 */
		getAppManifestOfCurrent(id: string): Promise<caps.AppManifest|undefined>;

		/**
		 * This returns bytes of a file from app's version pack. Undefined is
		 * returned, when a given app is not linked as currently installed.
		 * @param id identifies app.
		 * @param path is a path to file inside app folder of app's version pack.
		 */
		getAppFileBytesOfCurrent(id: string, path: string): Promise<Uint8Array|undefined>;

		/**
		 * This opens/starts app's web-gui component.
		 * @param id identifies app.
		 * @param entrypoint identifies component to start. Default is /index.html
		 * @param devTools is a flag to enable devtools in a started instance.
		 */
		openApp(
			id: string, entrypoint?: string, devTools?: boolean
		): Promise<void>;

		/**
		 * This triggers execution of a command.
		 * @param id identifies app.
		 * @param cmd identifies command and parameters that should be passed.
		 * @param devTools is a flag to enable devtools in a started instance.
		 */
		executeCommand(
			id: string, cmd: shell.commands.CmdParams, devTools?: boolean
		): Promise<void>;

		/**
		 * This triggers execution of all on-system-startup launchers.
		 * Such call is needed after the first system initialization setup.
		 */
		triggerAllStartupLaunchers(): Promise<void>;

		/**
		 * This closes apps that are running non-current versions after an update.
		 * @param appsToClose ids of apps that need old versions to be closed.
		 */
		closeAppsAfterUpdate(appsToClose: string[]): Promise<void>;
	}

	interface AppEvent {
		type: 'installed' | 'uninstalled' | 'pack-removed';
		id: string;
		version: string;
	}

	interface AppsDownloader {
		getAppChannels(id: string): Promise<DistChannels>;
		getLatestAppVersion(id: string, channel: string): Promise<string>;
		getAppVersionFilesList(
			id: string, version: string
		): Promise<AppDistributionList>;
		downloadWebApp(
			id: string, version: string, observer: Observer<DownloadProgress>
		): () => void;
	}

	interface DistChannels {
		channels: {
			[channel: string]: {
				description?: string;
				usage?: 'public' | 'staging';
			};
		};
		main?: string;
	}

	interface AppDistributionList {
		files: {
			[fName: string]: {
				content: DistAppFileContent;
				sha512: string;
				size: number;
			};
		};
	}

	type DistAppFileContent = 'bin/zip' | 'bin/unpacked' | 'src/zip';

	interface DownloadProgress {
		totalFiles: number;
		filesLeft: number;
		totalBytes: number;
		bytesLeft: number;
		fileInProgress?: string;
		currentFileSize?: number;
	}

	interface AppsInstaller {

		/**
		 * This lists bundled 3NWeb apps.
		 */
		listBundledApps(): Promise<{ id: string; version: string; }[]>;

		/**
		 * This unzips bundled app into user's packs' system folder.
		 * @param id 
		 * @param observer of unzipping process
		 */
		addPackFromBundledApps(
			id: string, observer: Observer<AppUnpackProgress>
		): () => void;

		/**
		 * This adds 
		 * @param appPackFS 
		 * @param observer 
		 */
		addAppPackFromFolder(
			appPackFS: files.ReadonlyFS, observer: Observer<AppUnpackProgress>
		): () => void;

		/**
		 * This adds 
		 * @param appPackFS 
		 * @param observer 
		 */
		addAppPackFromZipFile(
			appPackFile: files.ReadonlyFile, observer: Observer<AppUnpackProgress>
		): () => void;

		/**
		 * This lists all pack versions of all apps in user's packs' system folder.
		 */
		listAllAppsPacks(): Promise<{ id: string; versions: string[]; }[]>;

		/**
		 * This lists pack versions of a given app in user's packs' system folder.
		 * Undefined is returned, when a given app is not found in user's packs' system folder.
		 * @param id 
		 */
		listAppPacks(id: string): Promise<string[]|undefined>;

		/**
		 * This links given app version pack as currently installed in user's system.
		 * @param id 
		 * @param version 
		 */
		installApp(id: string, version: string): Promise<PostInstallState>;

		/**
		 * This removes app pack, if it isn't linked as currently installed.
		 * @param id 
		 * @param version 
		 */
		removeAppPack(id: string, version: string): Promise<void>;

		/**
		 * Uninstalls app by removing current link. The respective pack is not
		 * removed from user's packs' system folder byt his call.
		 * @param id 
		 */
		uninstallApp(id: string): Promise<void>;

		/**
		 * This removes apps data folders. If app is running, it will be closed first.
		 * @param id 
		 */
		removeAppData(id: string): Promise<void>;

		/**
		 * This starts watching app events, returning an unsubscribe function.
		 * @param observer is a consumer of app events
		 */
		watchApps(observer: Observer<AppEvent>): () => void;

		/**
		 * This returns a manifest of a particular app version. Undefined is
		 * returned, when a given app version is not found in user's system.
		 * @param id identifies app.
		 * @param version identifies app version.
		 */
		getAppManifest(id: string, version: string): Promise<caps.AppManifest|undefined>;

		/**
		 * This returns bytes of a file from app's version pack. Undefined is
		 * returned, when a given app version is not found in user's system.
		 * @param id identifies app.
		 * @param path is a path to file inside app folder of app's version pack.
		 * @param version identifies app version.
		 */
		getAppFileBytes(
			id: string, path: string, version: string
		): Promise<Uint8Array|undefined>;
	}

	type PostInstallState = 'all-done' | 'need-restart' | 'need-restart-many';

	interface AppUnpackProgress {
		numOfFiles: number;
		numOfProcessed: number;
		fileInProgress?: string;
	}

	interface SystemParamsForInstalledApp {
		capsGrantsOverrides?: CAPsGrantsOverrides;
		hasStartupLaunchers: boolean;
		launchersOverrides?: LaunchersOverrides;
	}

	interface CAPsGrantsOverrides {
	}

	interface LaunchersOverrides {
	}

	interface AppInitException extends RuntimeException {
		type: 'app-init',
		appDomain: string;
		entrypoint?: string;
		service?: string;
		command?: string;
		version?: string;
		badAppPack?: true;
		notInstalled?: true;
		noBundledPack?: true;
		errAtInstall?: true;
		errAtUninstall?: true;
		errAtPackRemoval?: true;
	}

}