/*
 Copyright (C) 2025 3NSoft Inc.
 
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
import { Caller, ExposedObj, callerSideJSONWrap as jsonCall, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';

type Clipboard = NonNullable<web3n.shell.ShellCAPs['clipboard']>;

export function exposeClipboardCAP(
	cap: Clipboard
): ExposedObj<Clipboard> {
	const exposed: ExposedObj<Clipboard> = {};
	for (const method of Object.keys(cap) as (keyof Clipboard)[]) {
		exposed[method] = jsonSrv.wrapReqReplySrvMethod(cap, method);
	}
	return exposed;
}

export function makeClipboard(
	caller: Caller, objPath: string[], exposed: (keyof Clipboard)[]
): Clipboard {
	const clipboard: Clipboard = {};
	for (const method of exposed) {
		clipboard[method] = shellClipboardCall(caller, objPath, method) as any;
	}
	return clipboard;
}

function shellClipboardCall<M extends keyof Clipboard>(
	caller: Caller, objPath: string[], method: M
): Clipboard[M] {
	return jsonCall.makeReqRepObjCaller<Clipboard, M>(caller, objPath.concat('clipboard'), method);
}
