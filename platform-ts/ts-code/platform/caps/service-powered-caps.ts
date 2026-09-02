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

import { openFileDialog, openFolderDialog, saveFileDialog, saveFolderDialog } from "./shell/file-dialogs/file-dialogs-cap-ipc";

type ExposeService = web3n.rpc.service.ExposeService;
type RPC = web3n.rpc.RPC;

declare var w3n: web3n.caps.W3N|undefined;

export function makeProviderOfCAPsViaRPC(exposeViaRPC: ExposeService): NonNullable<RPC['provideCAPtoSystem']> {
	return (capName: string, impl: any) => {
		function closeApp() {
			w3n?.closeSelf();
		}
		switch (capName) {
			case 'w3n.shell.fileDialogs.openFileDialog':
				openFileDialog.provideServiceOnAppSide(impl, exposeViaRPC, closeApp);
				return;
			case 'w3n.shell.fileDialogs.openFolderDialog':
				openFolderDialog.provideServiceOnAppSide(impl, exposeViaRPC, closeApp);
				return;
			case 'w3n.shell.fileDialogs.saveFileDialog':
				saveFileDialog.provideServiceOnAppSide(impl, exposeViaRPC, closeApp);
				return;
			case 'w3n.shell.fileDialogs.saveFolderDialog':
				saveFolderDialog.provideServiceOnAppSide(impl, exposeViaRPC, closeApp);
				return;
			default:
				throw `Implementation is not found for capability ${capName}`;
		}
	};
}


Object.freeze(exports);