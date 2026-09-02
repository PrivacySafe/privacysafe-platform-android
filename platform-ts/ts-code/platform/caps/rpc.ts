/*
 Copyright (C) 2020 - 2024, 2026 3NSoft Inc.
 
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

import type { ClientSideConnector } from "./rpc/index";
import { ServiceConnector } from "./rpc/index";
import { makeRPCException } from "../lib-common/manifest-utils";
import { AppSetter, Component, makeCAPsSetAppAndCloseFns, Service } from "../inject-defs/apps";
import { SYSTEM_DOMAIN } from "../inject-defs/confs";
import { makeAppInitExc } from "./shell";

type W3N = web3n.caps.W3N;
type AppComponent = web3n.caps.AppComponent;
type SrvComponent = web3n.caps.ServiceComponent | web3n.caps.GUIServiceComponent;
type CAPsImplementingComponent = web3n.caps.CAPsImplementingComponent | web3n.caps.CAPsImplementingGUIComponent;
type RequestedCAPs = web3n.caps.RequestedCAPs;
type ExposeService = web3n.rpc.service.ExposeService;
type AllowedCallers = web3n.caps.AllowedCallers

export const systemCAPsDomain = `caps.${SYSTEM_DOMAIN}`;


class ClientSideRPCConnections {

	private readonly connections = new Set<web3n.rpc.client.RPCConnection>();

	constructor(
		private readonly caller: Component,
		private readonly rpcClientSide: ClientSideConnector,
		private readonly appRPC: RequestedCAPs['appRPC'],
		private readonly otherAppsRPC: RequestedCAPs['otherAppsRPC'],
		private readonly caps: string[]|undefined
	) {
		Object.freeze(this);
	}

	private async makeConnection(appDomain: string, service: string): Promise<web3n.rpc.client.RPCConnection> {
		const { connection, doOnClose } = await this.rpcClientSide(this.caller, appDomain, service);
		this.connections.add(connection);
		doOnClose(() => this.connections.delete(connection));
		return connection;
	}

	async makeConnectionToThisApp(service: string): Promise<web3n.rpc.client.RPCConnection> {
		if (!this.appRPC || !this.appRPC.includes(service)) {
			throw makeRPCException(this.caller.domain, service, { callerNotAllowed: true });
		}
		return await this.makeConnection(this.caller.domain, service);
	}

	async makeConnectionToOtherApp(appDomain: string, service: string): Promise<web3n.rpc.client.RPCConnection> {
		if (!this.otherAppsRPC || !this.otherAppsRPC.find(r => ((r.app === appDomain) && (r.service === service)))) {
			throw makeRPCException(appDomain, service, { callerNotAllowed: true });
		}
		return await this.makeConnection(appDomain, service);
	}

	async makeConnectionToCAP(capName: string): Promise<web3n.rpc.client.RPCConnection> {
		if (!this.caps || !this.caps.includes(capName)) {
			throw makeRPCException(systemCAPsDomain, capName, { callerNotAllowed: true });
		}
		const { connection, doOnClose } = await this.rpcClientSide(
			this.caller,
			systemCAPsDomain,
			capName
		);
		this.connections.add(connection);
		doOnClose(() => this.connections.delete(connection));
		return connection;
	}

	close(): void {
		if (this.connections.size > 0) {
			for (const c of this.connections) {
				c.close();
			}
			this.connections.clear();
		}
	}

}
Object.freeze(ClientSideRPCConnections.prototype);
Object.freeze(ClientSideRPCConnections);


type RPC = NonNullable<W3N['rpc']>;

function makeAppRPC(rpcClientSide: ClientSideConnector, capsReq: RequestedCAPs): {
	cap: NonNullable<RPC['thisApp']>; setApp: AppSetter; close(): void;
}|undefined {
	if (!capsReq.appRPC || (capsReq.appRPC.length === 0)) {
		return;
	}
	let connections: ClientSideRPCConnections|undefined = undefined;
	return {
		cap: service => connections!.makeConnectionToThisApp(service),
		setApp: app => {
			connections = new ClientSideRPCConnections(app, rpcClientSide, capsReq.appRPC, undefined, undefined);
		},
		close: () => connections?.close()
	};
}

function makeOtherAppsRPC(rpcClientSide: ClientSideConnector, capsReq: RequestedCAPs): {
	cap: NonNullable<RPC['otherAppsRPC']>; setApp: AppSetter; close(): void;
}|undefined {
	const otherAppsSrvs = capsReq.otherAppsRPC?.filter(({ app }) => !app.endsWith(systemCAPsDomain));
	if (!otherAppsSrvs || (otherAppsSrvs.length === 0)) {
		return;
	}
	let connections: ClientSideRPCConnections|undefined = undefined;
	return {
		cap: (appDomain, service) => connections!.makeConnectionToOtherApp(appDomain, service),
		setApp: app => {
			connections = new ClientSideRPCConnections(app, rpcClientSide, undefined, otherAppsSrvs, undefined);
		},
		close: () => connections?.close()
	};
}

export function makeCAPconnector(
	capName: string, rpcClientSide: ClientSideConnector
): {
	cap: () => Promise<web3n.rpc.client.RPCConnection>;
	setApp: AppSetter; close(): void;
} {
	let connections: ClientSideRPCConnections|undefined = undefined;
	return {
		cap: () => connections!.makeConnectionToCAP(capName),
		setApp: app => {
			connections = new ClientSideRPCConnections(app, rpcClientSide, undefined, undefined, [ capName ]);
		},
		close: () => connections?.close()
	};
}

export function makeRpcCAP(
	rpcClientSide: ClientSideConnector, appDomain: string, componentDef: AppComponent, capsReq: RequestedCAPs
): {
	cap: RPC; setApp: AppSetter; close: () => void;
}|undefined {
	const exposeService = exposeServiceCAP(appDomain, componentDef as SrvComponent);
	const appRPC = makeAppRPC(rpcClientSide, capsReq);
	const otherAppsRPC = makeOtherAppsRPC(rpcClientSide, capsReq);
	const provideCAPtoSystem = makeCAPtoProvideCAPtoSystem(appDomain, componentDef as CAPsImplementingComponent);
	if (!exposeService && !appRPC && !otherAppsRPC && !provideCAPtoSystem) {
		return;
	}
	const cap: RPC = {
		thisApp: appRPC?.cap,
		otherAppsRPC: otherAppsRPC?.cap,
		exposeService: exposeService?.cap,

		// wrap on app's side uses this simple exposeService for providing CAPs, hence, we shadow type here
		provideCAPtoSystem: provideCAPtoSystem?.cap as any,
	};
	const { close, setApp } = makeCAPsSetAppAndCloseFns(exposeService, appRPC, otherAppsRPC, provideCAPtoSystem);
	return { cap, close, setApp };
}

function exposeServiceCAP(appDomain: string, componentDef: SrvComponent): {
	cap: ExposeService; setApp: AppSetter; close: () => void;
}|undefined {
	const expectedSrvs = servicesIn(componentDef);
	if (!expectedSrvs) {
		return;
	}
	return makeConnectorForExposedServices(
		appDomain, expectedSrvs, componentDef.services, !!componentDef.forOneConnectionOnly
	);
}

function makeConnectorForExposedServices(
	appDomain: string, expectedServices: string[], srvAllowedCallers: Record<string, AllowedCallers>,
	forOneConnectionOnly: boolean
): {
	cap: ExposeService; setApp: AppSetter; close: () => void;
}|undefined {
	const connectors: { [srvName: string]: ServiceConnector; } = {};
	for (const srvName of expectedServices) {
		connectors[srvName] = new ServiceConnector(
			appDomain, srvName, srvAllowedCallers[srvName], forOneConnectionOnly
		);
	}
	const setApp: AppSetter = app => {
		for (const [srvName, connector] of Object.entries(connectors)) {
			app.addService(srvName, connector.wrap());
		}
	};
	const close = (): void => {
		for (const connector of Object.values(connectors)) {
			connector.close();
		}
	};
	const cap: ExposeService = (service, obs) => {
		const connector = connectors[service];
		if (!connector) {
			throw makeAppInitExc(appDomain, {}, {
				message: `Service ${service} is not found in app setting`
			});
		}
		connector.setSinkForConnections(obs);
		return () => connector.close();
	};
	return { cap, setApp, close };
}

function servicesIn(componentDef: SrvComponent): string[]|undefined {
	if (componentDef.services) {
		const serviceNames = Object.keys(componentDef.services).filter(srvName => !srvName.startsWith('w3n.'));
		return ((serviceNames.length === 0) ? undefined : serviceNames);
	} else {
		return;
	}
}

function makeCAPtoProvideCAPtoSystem(appDomain: string, componentDef: CAPsImplementingComponent): {
	cap: ExposeService; setApp: AppSetter; close: () => void;
}|undefined {
	const expectedCAPs = capsProvidedBy(componentDef);
	if (!expectedCAPs) {
		return;
	}
	const allCallersAllowed: Record<string, AllowedCallers> = {};
	for (const cap of expectedCAPs) {
		allCallersAllowed[cap] = { otherApps: '*', thisAppComponents: '*' };
	}
	return makeConnectorForExposedServices(
		appDomain, expectedCAPs, allCallersAllowed, !!componentDef.forOneConnectionOnly
	);
}

function capsProvidedBy(componentDef: CAPsImplementingComponent): string[]|undefined {
	if (componentDef.capImpls) {
		return (Array.isArray(componentDef.capImpls) ? componentDef.capImpls : [ componentDef.capImpls ]);
	} else {
		return;
	}
}

export function makeServiceOverRPCFromPlatform(capName: string): { service: Service; provide: ExposeService; } {

	const allCallersAllowed: AllowedCallers = { otherApps: '*', thisAppComponents: '*' };
	const connector = new ServiceConnector(systemCAPsDomain, capName, allCallersAllowed, true);

	return {
		service: connector.wrap(),
		provide: (cap, obs) => {
			if (cap !== capName) {
				throw new TypeError(`Unexpected cap name ${cap}`);
			}
			connector.setSinkForConnections(obs);
			return () => connector.close();
		}
	};
}


Object.freeze(exports);