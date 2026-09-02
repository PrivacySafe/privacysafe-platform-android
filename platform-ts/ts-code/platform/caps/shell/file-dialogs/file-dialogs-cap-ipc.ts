/*
 Copyright (C) 2020, 2022, 2026 3NSoft Inc.
 
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

import { ExposedFn, Caller, ExposedObj, FileMsg, exposeFileService, CoreSideServices, makeFileCaller, FSMsg, exposeFSService, makeFSCaller } from 'core-3nweb-client-lib/build/ipc';
import { ProtoType } from '../../../lib-common/protobuf-msg';
import { file_dialogs as pb } from '../../../protos/file_dialogs.proto';
import { capViaRPC } from '../../rpc/client-caps-ipc';
import { SingleConnectionIPCWrap } from '../../../lib-common/service-ipc/ipc-service';
import { makeReqRepMethodCaller } from '../../../lib-common/service-ipc/ipc-service-caller';

type Dialogs = web3n.shell.files.Dialogs;
type ExposeService = web3n.rpc.service.ExposeService;

export function proxyFileDialogsCAP(
	cap: Dialogs, expServices: CoreSideServices
): ExposedObj<Dialogs> {
	const exposed: ExposedObj<Dialogs> = {};
	if (cap.openFileDialog) {
		exposed.openFileDialog = capViaRPC.expose(cap.openFileDialog as any, expServices);
	}
	if (cap.openFolderDialog) {
		exposed.openFolderDialog = capViaRPC.expose(cap.openFolderDialog as any, expServices);
	}
	if (cap.saveFileDialog) {
		exposed.saveFileDialog = capViaRPC.expose(cap.saveFileDialog as any, expServices);
	}
	if (cap.saveFolderDialog) {
		exposed.saveFolderDialog = capViaRPC.expose(cap.saveFolderDialog as any, expServices);
	}
	return exposed;
}

export function makeFileDialogs(
	caller: Caller, objPath: string[], exposed: (keyof Dialogs)[]
): Dialogs {
	const dialogs: Dialogs = {};
	if (exposed.includes('openFileDialog')) {
		dialogs.openFileDialog = openFileDialog.capOnAppSide(caller, objPath.concat('openFileDialog'));
	}
	if (exposed.includes('openFolderDialog')) {
		dialogs.openFolderDialog = openFolderDialog.capOnAppSide(caller, objPath.concat('openFolderDialog'));
	}
	if (exposed.includes('saveFileDialog')) {
		dialogs.saveFileDialog = saveFileDialog.capOnAppSide(caller, objPath.concat('saveFileDialog'));
	}
	if (exposed.includes('saveFolderDialog')) {
		dialogs.saveFolderDialog = saveFolderDialog.capOnAppSide(caller, objPath.concat('saveFolderDialog'));
	}
	return dialogs;
}


export namespace openFileDialog {

	const serviceName = 'w3n.shell.fileDialogs.openFileDialog';

	export type capType = NonNullable<Dialogs['openFileDialog']>

	export function provideServiceOnAppSide(fn: capType, exposeViaRPC: ExposeService, closeApp: () => void): void {
		const srv = new SingleConnectionIPCWrap(serviceName, closeApp);
		srv.addReqReplyMethod('open', undefined, fn);
		srv.startIPC(exposeViaRPC);
	}

	export function capOnAppSide(caller: Caller, objPath: string[]): capType {
		const connect = capViaRPC.makeClient(caller, objPath);
		return async (title, btnLabel, multiSelections, filters) => {
			const conn = await connect();
			try {
				const capProxy = makeReqRepMethodCaller<capType>(conn, 'open');
				return await capProxy(title, btnLabel, multiSelections, filters);
			} finally {
				conn.close();
			}
		};
	}

}
Object.freeze(openFileDialog);


export namespace openFolderDialog {

	const serviceName = 'w3n.shell.fileDialogs.openFolderDialog';

	export type capType = NonNullable<Dialogs['openFolderDialog']>

	export function provideServiceOnAppSide(fn: capType, exposeViaRPC: ExposeService, closeApp: () => void): void {
		const srv = new SingleConnectionIPCWrap(serviceName, closeApp);
		srv.addReqReplyMethod('open', undefined, fn);
		srv.startIPC(exposeViaRPC);
	}

	export function capOnAppSide(caller: Caller, objPath: string[]): capType {
		const connect = capViaRPC.makeClient(caller, objPath);
		return async (title, btnLabel, multiSelections, filters) => {
			const conn = await connect();
			try {
				const capProxy = makeReqRepMethodCaller<capType>(conn, 'open');
				return await capProxy(title, btnLabel, multiSelections, filters);
			} finally {
				conn.close();
			}
		};
	}

}
Object.freeze(openFolderDialog);


export namespace saveFileDialog {

	const serviceName = 'w3n.shell.fileDialogs.saveFileDialog';

	export function provideServiceOnAppSide(
		fn: NonNullable<Dialogs['saveFileDialog']>, exposeViaRPC: ExposeService, closeApp: () => void
	): void {
		const srv = new SingleConnectionIPCWrap(serviceName, closeApp);
		srv.addReqReplyMethod('open', undefined, fn);
		srv.startIPC(exposeViaRPC);
	}

	export function capOnAppSide(caller: Caller, objPath: string[]): NonNullable<Dialogs['saveFileDialog']> {
		const connect = capViaRPC.makeClient(caller, objPath);
		return async (title, btnLabel, defaultPath, filters) => {
			const conn = await connect();
			try {
				const capProxy = makeReqRepMethodCaller<NonNullable<Dialogs['saveFileDialog']>>(conn, 'open');
				return await capProxy(title, btnLabel, defaultPath, filters);
			} finally {
				conn.close();
			}
		};
	}

}
Object.freeze(openFileDialog);


export namespace saveFolderDialog {

	const serviceName = 'w3n.shell.fileDialogs.saveFolderDialog';

	export function provideServiceOnAppSide(
		fn: NonNullable<Dialogs['saveFolderDialog']>, exposeViaRPC: ExposeService, closeApp: () => void
	): void {
		const srv = new SingleConnectionIPCWrap(serviceName, closeApp);
		srv.addReqReplyMethod('open', undefined, fn);
		srv.startIPC(exposeViaRPC);
	}

	export function capOnAppSide(caller: Caller, objPath: string[]): NonNullable<Dialogs['saveFolderDialog']> {
		const connect = capViaRPC.makeClient(caller, objPath);
		return async (title, btnLabel, defaultPath, filters) => {
			const conn = await connect();
			try {
				const capProxy = makeReqRepMethodCaller<NonNullable<Dialogs['saveFolderDialog']>>(conn, 'open');
				return await capProxy(title, btnLabel, defaultPath, filters);
			} finally {
				conn.close();
			}
		};
	}

}
Object.freeze(openFileDialog);


Object.freeze(exports);