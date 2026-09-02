/*
 Copyright (C) 2023, 2026 3NSoft Inc.
 
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

import { Caller } from 'core-3nweb-client-lib/build/ipc';
import { otherAppsRPC, thisAppRPC } from './client-caps-ipc';
import { exposeService, provideCAPViaRPC } from './expose-service-cap-ipc';
import { makeProviderOfCAPsViaRPC } from '../service-powered-caps';

type RPC = web3n.rpc.RPC;

export function makeRpcCaller(caller: Caller, objPath: string[]): RPC {
	if (!caller.listObj) {
		throw new Error(`Caller here expects to have method 'listObj'`);
	}
	const lstAppsCAP = caller.listObj(objPath) as (keyof RPC)[];
	return makeRpcFollowingListing(lstAppsCAP, caller, objPath);
}

export async function promiseRpcCaller(
	caller: Caller, objPath: string[]
): Promise<RPC> {
	if (!caller.listObjAsync) {
		throw new Error(`Caller here expects to have method 'listObjAsync'`);
	}
	const lstRpcCAP = (await caller.listObjAsync(objPath)) as (keyof RPC)[];
	return makeRpcFollowingListing(lstRpcCAP, caller, objPath);
}

function makeRpcFollowingListing(
	lstRpcCAP: (keyof RPC)[], caller: Caller, objPath: string[]
): RPC {
	const rpc: RPC = {};
	if (lstRpcCAP.includes('thisApp')) {
		rpc.thisApp = thisAppRPC.makeClient(caller, objPath.concat('thisApp'));
	}
	if (lstRpcCAP.includes('otherAppsRPC')) {
		rpc.otherAppsRPC = otherAppsRPC.makeClient(caller, objPath.concat('otherAppsRPC'));
	}
	if (lstRpcCAP.includes('exposeService')) {
		rpc.exposeService = exposeService.makeClient(caller, objPath.concat('exposeService'));
	}
	if (lstRpcCAP.includes('provideCAPtoSystem')) {
		const capRPC = provideCAPViaRPC.makeClient(caller, objPath.concat('provideCAPtoSystem'));
		rpc.provideCAPtoSystem = makeProviderOfCAPsViaRPC(capRPC);
	}
	return rpc;
}


Object.freeze(exports);