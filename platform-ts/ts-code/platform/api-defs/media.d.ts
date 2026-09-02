/*
 Copyright (C) 2024 - 2025 3NSoft Inc.

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


declare namespace web3n.media {

	interface MediaDevices {
		/**
		 * Sets handler for choosing "display media": screens and windows.
		 */
		setSelectDisplayMediaForCaptureHandler?: SetSelectDisplayMediaForCaptureHandler;

		isAudioCaptureAvailable(): Promise<boolean>;

		ensureDeviceAllowsScreenCapture(): Promise<boolean>;

	}

	/**
	 * Selector should return an id of desired choice, or undefined, when
	 * nothing is selected.
	 */
	type SelectDisplayMediaForCapture = (
		choices: DisplaySourceInfo
	) => Promise<string|undefined>;

	type SetSelectDisplayMediaForCaptureHandler = (
		handler: SelectDisplayMediaForCapture
	) => Promise<void>;

	interface DisplaySourceInfo {
		screens?: ScreenSrcInfo[];
		windows?: WindowSrcInfo[];
	}

	interface ScreenSrcInfo {
		id: string;
		name: string;
		display_id: string;
		thumbnail: Uint8Array;
	}

	interface WindowSrcInfo {
		id: string;
		name: string;
		thumbnail: Uint8Array;
		appIcon?: Uint8Array;
	}

}