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

import type { CmdsHandler } from "../caps/shell/cmd-invocation";

type RPCConnection = web3n.rpc.client.RPCConnection;
type CommonDef = web3n.caps.CommonComponentSetting;
type OpenConnectionInfo = web3n.system.monitor.OpenConnectionInfo;

export interface Component {
	readonly runtime: CommonDef['runtime'];
	readonly domain: string;
	readonly entrypoint: string;
	start(): Promise<void>;
	setCloseListener(onClose: () => void): void;
	close(): void;
	addService(name: string, service: Service): void;
	getService(name: string): Promise<Service>;
	listServiceConnections(): OpenConnectionInfo[]|undefined;
}

export interface GUIComponent extends Component {
	setCmdHandler: (handler: CmdsHandler) => void;
	cmdsHandler: CmdsHandler|undefined;
	focusWindow(): void;
}

export interface Service {

	canHandleCall(): boolean;

	ensureCallerAllowed(callerApp: string, callerComponent: string): void;

	connect(callerApp: string, callerComponent: string): Promise<{
		connection: RPCConnection;
		doOnClose: (cleanup: ()=>void) => void;
	}>;

	listOpenConnections(entrypoint: string): OpenConnectionInfo[];

}

type W3N = web3n.caps.W3N;
type SitesW3N = web3n.caps.sites.W3N;

export interface AppCAPsAndSetup {
	w3n: W3N;
	close: () => void;
	setApp: AppSetter;
}

export interface SiteCAPsAndSetup {
	w3n: SitesW3N;
}

export type AppSetter = (app: Component) => void;

export interface CAPsSetupFns {
	close?: () => void;
	setApp?: AppSetter;
}

export function makeCAPsSetAppAndCloseFns(...fns: (CAPsSetupFns|undefined)[]): {
	close: () => void; setApp: AppSetter;
} {
	const closeFns: (() => void)[] = [];
	const setAppFns: AppSetter[] = [];
	for (const setupFns of fns) {
		if (setupFns) {
			const { close, setApp } = setupFns;
			if (close) {
				closeFns.push(close);
			}
			if (setApp) {
				setAppFns.push(setApp);
			}
		}
	}
	return {
		close: ((closeFns.length > 0) ?
			() => {
				try {
					for (const closeFn of closeFns) {
						closeFn();
					}
				} catch (err) {
					console.error(err);
				}
			} :
			noop
		),
		setApp: ((setAppFns.length > 0) ?
			app => {
				for (const setApp of setAppFns) {
					setApp(app);
				}
			} :
			noop
		)
	};
}

function noop() {}
