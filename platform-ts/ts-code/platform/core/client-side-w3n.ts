/*
 Copyright (C) 2020 - 2025 3NSoft Inc.
 
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

import { ClientSide, makeW3Nclient, promiseW3Nclient, callerSideJSONWrap as jsonCall, Caller } from 'core-3nweb-client-lib/build/ipc';
import { makeTestStandCaller, promiseTestStandCaller } from "../caps/test-stand/test-stand-cap-ipc";
import { makeConnectivity } from '../caps/connectivity/connectivity-cap-ipc';
import { makeSystemCaller, promiseSystemCaller } from '../caps/system/ipc-client-side';
import { makeShellCaller, promiseShellCaller } from '../caps/shell/ipc-client-side';
import { makeRpcCaller, promiseRpcCaller } from '../caps/rpc/ipc-client-side';
import { makeMediaDevices, promiseMediaDevices } from '../caps/media-devices/ipc-client-side';
import { makeUICaller } from '../caps/ui/ipc-client-side';

type W3N = web3n.system.W3N;

function jsonFuncCall<F extends Function>(clientSide: Caller, path: string[]): F {
	return jsonCall.makeReqRepFuncCaller(clientSide, path);
}
const jsonFuncCallSwallowingErrs: typeof jsonFuncCall<any> = (a, b) => {
	const fn = jsonFuncCall(a,b);
	return function() {
		return fn.call(undefined, ...arguments).catch(noop);
	}
};

export function makeClientSideW3N(clientSide: ClientSide): W3N {
	const clientW3N = makeW3Nclient<W3N & web3n.testing.CommonW3N>(
		clientSide,
		{
			closeSelf: jsonFuncCallSwallowingErrs,
			myVersion: jsonFuncCall,
			ui: makeUICaller,
			system: makeSystemCaller,
			testStand: makeTestStandCaller,
			shell: makeShellCaller,
			rpc: makeRpcCaller,
			connectivity: makeConnectivity,
			mediaDevices: makeMediaDevices
		}
	);
	addDeprecatedItems(clientW3N);
	return clientW3N;
}

export async function promiseClientSideW3N(clientSide: ClientSide): Promise<W3N> {
	const clientW3N = await promiseW3Nclient<W3N & web3n.testing.CommonW3N>(
		clientSide,
		{
			closeSelf: jsonFuncCallSwallowingErrs,
			myVersion: jsonFuncCall,
			ui: makeUICaller,
			system: promiseSystemCaller,
			testStand: promiseTestStandCaller,
			shell: promiseShellCaller,
			rpc: promiseRpcCaller,
			connectivity: makeConnectivity,
			mediaDevices: promiseMediaDevices
		}
	);
	addDeprecatedItems(clientW3N);
	return clientW3N;
}

function addDeprecatedItems(clientW3N: W3N): void {
	try {
		if (clientW3N.rpc?.thisApp) {
			(clientW3N as any).appRPC = wrapExistingFn(
				clientW3N.rpc.thisApp,
				`Deprecations warning:\nUse w3n.rpc.thisApp instead of w3n.appRPC.`
			);
		}
		if (clientW3N.rpc?.otherAppsRPC) {
			(clientW3N as any).otherAppsRPC = wrapExistingFn(
				clientW3N.rpc.otherAppsRPC,
				`Deprecations warning:\nUse w3n.rpc.otherAppsRPC instead of w3n.otherAppsRPC.`
			);
		}
		if (clientW3N.rpc?.exposeService) {
			(clientW3N as any).exposeService = wrapExistingFn(
				clientW3N.rpc.exposeService,
				`Deprecations warning:\nUse w3n.rpc.exposeService instead of w3n.exposeService.`
			);
		}
	} catch (err) {
		console.error(`\n@ deprecation part:\n`, err);
	}
}

function wrapExistingFn<F extends Function>(fn: F, warnMsg: string): F {
	let showWarning = true;
	return function(...args: any[]) {
		if (showWarning) {
			console.warn(warnMsg);
			showWarning = false;
		}
		return fn.apply(undefined, args);
	} as Function as F;
}

function noop() {}

type DefaultProvider = web3n.caps.startup.DefaultProviderSite;

function providerMethod<M extends keyof DefaultProvider>(
	caller: Caller, objPath: string[], method: M
): DefaultProvider[M] {
	return jsonCall.makeReqRepObjCaller(caller, objPath, method);
}

export function makeProviderCaller(caller: Caller, objPath: string[]): web3n.caps.startup.DefaultProviderSite {
	return {
		openInExternal: providerMethod(caller, objPath, 'openInExternal'),
		openSiteInChildWindow: providerMethod(caller, objPath, 'openSiteInChildWindow'),
		closeSite: providerMethod(caller, objPath, 'closeSite'),
		getSignupToken: providerMethod(caller, objPath, 'getSignupToken'),
	};
}


Object.freeze(exports);