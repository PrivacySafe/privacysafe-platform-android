/*
 Copyright (C) 2020 - 2022, 2024 - 2026 3NSoft Inc.
 
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

import { Subject } from "rxjs";
import { Envelope, ObjectsConnector, ClientSide, makeStartupW3Nclient, callerSideJSONWrap as jsonCall } from 'core-3nweb-client-lib/build/ipc';
import { toBuffer } from "../../platform/lib-common/buffer-utils";
import { makeStartupTestStandCaller } from "../../platform/caps/test-stand/test-stand-cap-ipc";
import { makeClientSideW3N, makeProviderCaller } from "../../platform/core/client-side-w3n";
import type { InitIPC } from "./ipc-type";

type StartupW3N = web3n.caps.startup.W3N;
type W3N = web3n.caps.W3N;

export function makeClientSideConnector({
	listObjOnServiceSide, sendMsgToCore, setHandlerOfMsgsFromCore
}: InitIPC): ClientSide {
	const fromCore = new Subject<Envelope>();
	const coreListener = (msg: Envelope) => {
		if (msg.body) {
			msg.body.value = toBuffer(msg.body.value);
		}
		fromCore.next(msg);
	};
	const detachListener = setHandlerOfMsgsFromCore(coreListener);
	const toClient = fromCore.asObservable();
	const fromClient = new Subject<Envelope>();
	fromClient.asObservable().subscribe({
		next: msg => sendMsgToCore(msg),
		error: detachListener,
		complete: detachListener
	});
	return ObjectsConnector.makeClientSide(
		fromClient, toClient, listObjOnServiceSide
	);
}

export function makeStartupW3N(ipc: InitIPC): StartupW3N {
	const clientSide = makeClientSideConnector(ipc);
	const clientW3N = makeStartupW3Nclient<web3n.testing.StartupW3N>(
		clientSide, {
			testStand: makeStartupTestStandCaller,
			provider: makeProviderCaller,
			enableAutoLogin: (caller, path) => jsonCall.makeReqRepFuncCaller(caller, path),
			scanUrlQR: (caller, path) => jsonCall.makeReqRepFuncCaller(caller, path)
		}
	) as StartupW3N;
	return clientW3N;
}

export function makeW3N(ipc: InitIPC): W3N {
	const clientSide = makeClientSideConnector(ipc);
	const w3n = makeClientSideW3N(clientSide);
	if (w3n.shell?.deviceFiles) {
		const { standardFileToPath } = ipc;
		function getPathIfNotMemoryBasedFile(f: File): string {
			const path = standardFileToPath!(f);
			if (path.length === 0) {
				throw {
					runtimeException: true,
					type: 'file',
					isInMemoryFile: true,
					file: f
				};
			}
			return path;
		}
		const { standardFileToDeviceFile, standardFileToDeviceFolder, statStandardItem } = w3n.shell.deviceFiles;
		if (standardFileToDeviceFile) {
			w3n.shell.deviceFiles.standardFileToDeviceFile = async f => {
				const path = getPathIfNotMemoryBasedFile(f);
				return await standardFileToDeviceFile(path as any);
			};
		}
		if (standardFileToDeviceFolder) {
			w3n.shell.deviceFiles.standardFileToDeviceFolder = async f => {
				const path = getPathIfNotMemoryBasedFile(f);
				return await standardFileToDeviceFolder(path as any);
			};
		}
		w3n.shell.deviceFiles.statStandardItem = async f => {
			const path = getPathIfNotMemoryBasedFile(f);
			return await statStandardItem(path as any);
		};
	}
	return w3n;
}


Object.freeze(exports);