/*
 Copyright (C) 2017 - 2018, 2020 - 2022, 2024 - 2026 3NSoft Inc.

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

/// <reference path="../../../node_modules/core-3nweb-client-lib/build/api-defs/web3n.d.ts" />
/// <reference path="./shell.d.ts" />
/// <reference path="./shell-dialogs.d.ts" />
/// <reference path="./shell-clipboard.d.ts" />
/// <reference path="./shell-notifications.d.ts" />
/// <reference path="./shell-commands.d.ts" />
/// <reference path="./shell-mounts.d.ts" />
/// <reference path="./connectivity.d.ts" />
/// <reference path="./rpc.d.ts" />
/// <reference path="./ui.d.ts" />
/// <reference path="./manifest.d.ts" />
/// <reference path="./media.d.ts" />
/// <reference path="./test-stand.d.ts" />
/// <reference path="./w3n-startup.d.ts" />

declare namespace web3n.caps {

	/**
	 * This is a definition of capabilities' object, injected into the DOM.
	 * One has to ensure that any particular capability is given, before trying
	 * to use it.
	 */
	interface W3N extends caps.common.W3N {

		/**
		 * closeSelf closes current component instance, which is self in the
		 * context.
		 */
		closeSelf: () => void;

		/**
		 * myVersion returns version of current app.
		 */
		myVersion: () => Promise<string>;

		ui: ui.UI;

		// idea for lifecycle methods
		// lifecycle: {
		//   addListener: (event, hook) => void;
		// };

		shell?: shell.ShellCAPs;
		rpc?: rpc.RPC;
		connectivity?: connectivity.Connectivity;
		mediaDevices?: media.MediaDevices;

	}

}
