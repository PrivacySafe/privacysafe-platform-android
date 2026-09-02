/*
 Copyright (C) 2022, 2025 3NSoft Inc.

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

type Connectivity = web3n.connectivity.Connectivity;

export function exposeConnectivityCAP(
	cap: Connectivity
): ExposedObj<Connectivity> {
	return {
		isOnline: jsonSrv.wrapReqReplySrvMethod(cap, 'isOnline'),
		watch: jsonSrv.wrapObservingFunc(cap.watch)
	};
}

export function makeConnectivity(
	caller: Caller, objPath: string[]
): Connectivity {
	return {
		isOnline: jsonCall.makeReqRepObjCaller<Connectivity, 'isOnline'>(caller, objPath, 'isOnline'),
		watch: jsonCall.makeObservableFuncCaller(caller, objPath.concat('watch'))
	};
}


Object.freeze(exports);