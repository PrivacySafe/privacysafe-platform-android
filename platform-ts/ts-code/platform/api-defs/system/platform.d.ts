/*
 Copyright (C) 2021 - 2026 3NSoft Inc.

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

/// <reference path="./apps.d.ts" />

/**
 * This is used by system utility launcher app, and concerns only platform
 * developers, not app developers.
 */
declare namespace web3n.system.platform {

	interface Platform {

		/**
		 * This returns information about platform version and bundled apps with it.
		 */
		getCurrentVersion(): Promise<BundleVersions>;

		/**
		 * This wipes data folder from device and quits.
		 */
		wipeFromThisDevice(): Promise<void>;

		/**
		 * Downloader of platform's updates exists in os pack that allows native app to update itself directly.
		 * When platform app is distributed via external package managers, or stores, downloader is not present.
		 */
		downloader?: PlatformDownloader;
	}

	interface PlatformDownloader {
		getChannels(): Promise<apps.DistChannels>;
		getLatestVersion(channel: string): Promise<BundleVersions>;
		setupUpdater(newBundleVersion: string, observer: Observer<PlatformUpdateEvents>): () => void;
		downloadUpdate(): Promise<string[]|undefined>;
		quitAndInstall(): Promise<void>;
	}

  interface BundleVersions {
    platform: string;
    apps: {
      [ id: string ]: string;
    };
    'app-packs': {
      [ id: string ]: string;
    };
    runtimes: {
      [ rtName: string ]: string;
    };
    bundle: string;
  }

	type PlatformUpdateEvents = {
		event: 'checking-for-update';
	} | {
		event: 'update-not-available';
		info: UpdateInfo;
	} | {
		event: 'update-available';
		info: UpdateInfo;
	} | {
		event: 'update-downloaded';
		info: UpdateDownloadedEvent;
	} | {
		event: 'download-progress';
		info: ProgressInfo;
	} | {
		event: 'update-cancelled';
		info: UpdateInfo;
	} | {
		event: 'appimage-filename-updated';
		path: string;
	};

	interface UpdateInfo {
		/**
		 * The version.
		 */
		readonly version: string;
		readonly files: Array<UpdateFileInfo>;
		/**
		 * The release name.
		 */
		releaseName?: string | null;
		/**
		 * The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
		 */
		releaseNotes?: string | Array<ReleaseNoteInfo> | null;
		/**
		 * The release date.
		 */
		releaseDate: string;
		/**
		 * The [staged rollout](/auto-update#staged-rollouts) percentage, 0-100.
		 */
		readonly stagingPercentage?: number;
		/**
		 * The minimum version of system required for the app to run. Sample value: macOS `23.1.0`, Windows `10.0.22631`.
		 * Same with os.release() value, this is a kernel version.
		 */
		readonly minimumSystemVersion?: string;
	}
	interface UpdateDownloadedEvent extends UpdateInfo {
		downloadedFile: string;
	}
	interface ProgressInfo {
		total: number;
		delta: number;
		transferred: number;
		percent: number;
		bytesPerSecond: number;
	}
	interface ReleaseNoteInfo {
		/**
		 * The version.
		 */
		readonly version: string;
		/**
		 * The note.
		 */
		readonly note: string | null;
	}
	interface BlockMapDataHolder {
		/**
		 * The file size. Used to verify downloaded size (save one HTTP request to get length).
		 * Also used when block map data is embedded into the file (appimage, windows web installer package).
		 */
		size?: number;
		/**
		 * The block map file size. Used when block map data is embedded into the file (appimage, windows web installer package).
		 * This information can be obtained from the file itself, but it requires additional HTTP request,
		 * so, to reduce request count, block map size is specified in the update metadata too.
		 */
		blockMapSize?: number;
		/**
		 * The file checksum.
		 */
		readonly sha512: string;
		readonly isAdminRightsRequired?: boolean;
	}
	interface PackageFileInfo extends BlockMapDataHolder {
		readonly path: string;
	}
	interface UpdateFileInfo extends BlockMapDataHolder {
		url: string;
	}

}
