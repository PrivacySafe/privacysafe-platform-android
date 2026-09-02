/*
 Copyright (C) 2017 - 2018, 2020 3NSoft Inc.

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


/**
 * This is a namespace for things used by ui-related functionality.
 */
declare namespace web3n.ui {

	/**
	 * These options are a whitelisted subset of options for Electron's window.
	 * Note that comments are taken from Electron verbatim.
	 */
	interface WindowOptions {
		/**
		 * Window’s width in pixels.
		 * Default: 800.
		 */
		width?: number;
		/**
		 * Window’s height in pixels.
		 * Default: 600.
		 */
		height?: number;
		/**
		 * Window’s left offset from screen.
		 * Default: center the window.
		 */
		x?: number;
		/**
		 * Window’s top offset from screen.
		 * Default: center the window.
		 */
		y?: number;
		/**
		 * Show window in the center of the screen.
		 * Default: true
		 */
		center?: boolean;
		/**
		 * Window’s minimum width.
		 * Default: 0.
		 */
		minWidth?: number;
		/**
		 * Window’s minimum height.
		 * Default: 0.
		 */
		minHeight?: number;
		/**
		 * Window’s maximum width.
		 * Default: no limit.
		 */
		maxWidth?: number;
		/**
		 * Window’s maximum height.
		 * Default: no limit.
		 */
		maxHeight?: number;
		/**
		 * Whether window is resizable.
		 * Default: true.
		 */
		resizable?: boolean;
		/**
		 * Whether window is movable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		movable?: boolean;
		/**
		 * Whether window is minimizable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		minimizable?: boolean;
		/**
		 * Whether window is maximizable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		maximizable?: boolean;
		/**
		 * Whether to show the window in taskbar.
		 * Default: false.
		 */
		skipTaskbar?: boolean;
		/**
		 * Specify false to create a Frameless Window.
		 * Default: true.
		 */
		frame?: boolean;
		/**
		 * Whether this is a modal window. This only works when the window is a child window.
		 * Default: false.
		 */
		modal?: boolean;
		/**
		 * Remember window size and location if it was adjusted.
		 * Default: false.
		 */
		rememberWindowLocation?: boolean;
	}

	interface UI {
		uiFormFactor(): Promise<FormFactor>;
	}

	type FormFactor = 'desktop' | 'tablet' | 'phone' |
		'phone+screen' | 'tablet+screen';

}
