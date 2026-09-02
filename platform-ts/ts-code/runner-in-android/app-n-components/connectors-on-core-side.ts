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

import { CoreSide, exposeStartupW3N, Envelope, ObjectsConnector, exposeW3N, serviceSideJSONWrap as jsonSrv, ExposedFn, msgProtoType, ExposedObj } from "core-3nweb-client-lib/build/ipc";
import { Subject } from "rxjs";
import { exposeRpcCAP } from "../../platform/caps/rpc/ipc-core-side";
import { exposeShellCAPs } from "../../platform/caps/shell/ipc-core-side";
import { exposeTestStandCAP } from "../../platform/caps/test-stand/test-stand-cap-ipc";
import { exposeUICAP } from "../../platform/caps/ui/ipc-core-side";
import { exposeConnectivityCAP } from "../../platform/caps/connectivity/connectivity-cap-ipc";
import { exposeMediaDevicesCAP } from "../../platform/caps/media-devices/ipc-core-side";
import { exposeSystemCAP } from "../../platform/caps/system/ipc-core-side";
import { toBuffer } from "../../platform/lib-common/buffer-utils";
import { openBinaryMsgPort } from "../jsengine/runtime-ipc-via-ports";
import { AppFolder } from "../../platform/apps/app";

type StartupW3N = web3n.startup.W3N;
type W3N = web3n.caps.W3N;
type DefaultProvider = web3n.caps.startup.DefaultProviderSite;


export class ConnectorsAndComponents {

	private readonly connectors = new Map<string, Connector>();
	private nextId = 1;

	constructor() {
		Object.seal(this);
	}

  getCoreSideConnector(cId: string): CoreSide {
    const connector = this.connectors.get(cId);
    if (connector) {
      return connector.coreSide;
    } else {
      throw Error(`Connector ${cId} is not found`);
    }
  }

  disconnectAndRemove(cId: string): void {
		const connector = this.connectors.get(cId);
		if (connector) {
			this.connectors.delete(cId);
			connector.close?.();
			connector.component?.close();
		}
  }

	async attachToPort(connectorId: string): Promise<void> {
		const c = this.connectors.get(connectorId)
		if (!c) {
			throw `Connector ${connectorId} is not found`;
		}
		if (!c.attachToPort) {
			throw `Connector ${connectorId} has already been attached to port`;
		}
		c.close = await c.attachToPort();
		c.attachToPort = undefined;
	}

	private getNextId(): string {
		this.nextId += 1;
		let connectorId = `${this.nextId}`;
		while (this.connectors.has(connectorId)) {
			this.nextId += 1;
			connectorId = `${this.nextId}`;
		}
    return connectorId;
  }

	connectStartupW3N(coreW3N: StartupW3N): {
		connectorId: string;
		setComponent: (c: ComponentForAndroidAccess) => void;
	} {
		const { connectorId, coreSide } = this.makeCoreSideConnector();
		exposeStartupW3N(
			coreSide,
			coreW3N as web3n.testing.StartupW3N,
			extraStartupCAPs
		);
    return {
			connectorId,
			setComponent: c => {
				const connector = this.connectors.get(c.connectorId);
				if (connector) {
					connector.component = c;
				} else {
					throw new Error(`Connector not found for id ${c.connectorId}`);
				}
			}
		};
	}

	connectW3N(coreW3N: W3N): {
		connectorId: string;
		setComponent: (c: ComponentForAndroidAccess) => void;
	} {
		const { connectorId, coreSide } = this.makeCoreSideConnector();
		exposeW3N(
			coreSide,
			coreW3N as web3n.testing.CommonW3N,
			extraCAPs
		);
    return {
			connectorId,
			setComponent: c => {
				const connector = this.connectors.get(c.connectorId);
				if (connector) {
					connector.component = c;
				} else {
					throw new Error(`Connector not found for id ${c.connectorId}`);
				}
			}
		};
	}

	getComponent(cId: string): ComponentForAndroidAccess|undefined {
		return this.connectors.get(cId)?.component;
	}

	removeConnector(cId: string): Connector|undefined {
		const connector = this.connectors.get(cId);
		if (connector) {
			this.connectors.delete(cId);
		}
		return connector;
	}

	private makeCoreSideConnector(): { connectorId: string; coreSide: CoreSide; } {
		const fromCore = new Subject<Envelope>();
		const fromClient = new Subject<Envelope>();
		const toCore = fromClient.asObservable();
    const connectorId = this.getNextId();
		const removeConnector = () => {
			fromClient.complete();
			this.disconnectAndRemove(connectorId);
		}

		async function attachToPort(): Promise<() => void> {
			const port = await openBinaryMsgPort(`c-${connectorId}`, msgFromClient => {
				const msg = msgProtoType.unpack(toBuffer(msgFromClient));
				fromClient.next(msg);
			});
			const sub = fromCore.asObservable().subscribe({
				next: msgFromCore => {
					const msgBytes = msgProtoType.pack(msgFromCore);
					port.send(msgBytes);
				},
				error: removeConnector,
				complete: removeConnector
			});
			return () => {
				sub.unsubscribe();
				fromClient.complete();
				port.close();
			};
		}

		const coreSide = ObjectsConnector.makeCoreSide(fromCore, toCore);
		this.connectors.set(connectorId, { coreSide, fromClient, attachToPort });
		return { connectorId, coreSide };
	}

}
Object.freeze(ConnectorsAndComponents.prototype);
Object.freeze(ConnectorsAndComponents);


export interface ComponentForAndroidAccess {
	connectorId: string;
	appRoot: AppFolder;
	entrypoint: string;
	close: () => void;
}

interface Connector {
	coreSide: CoreSide;
	fromClient: Subject<Envelope>;
	attachToPort?: () => Promise<() => void>;
	close?: () => void;
	component?: ComponentForAndroidAccess;
}

function exposeJSONFunc<F extends Function>(fn: F): ExposedFn {
	return jsonSrv.wrapReqReplyFunc(fn as any);
}

const extraCAPs = Object.freeze({
	closeSelf: exposeJSONFunc,
	myVersion: exposeJSONFunc,
	ui: exposeUICAP,
	system: exposeSystemCAP,
	testStand: exposeTestStandCAP,
	shell: exposeShellCAPs,
	rpc: exposeRpcCAP,
	connectivity: exposeConnectivityCAP,
	mediaDevices: exposeMediaDevicesCAP
});

const extraStartupCAPs = Object.freeze({
	provider: exposeProviderCAP,
	enableAutoLogin: exposeJSONFunc,
	scanUrlQR: exposeJSONFunc
}) as any;

function exposeProviderCAP(cap: DefaultProvider): ExposedObj<DefaultProvider> {
	// XXX have only one function for now, hence exposing it only.
	return {
		openInExternal: jsonSrv.wrapReqReplySrvMethod(cap, 'openInExternal'),
		// openSiteInChildWindow: jsonSrv.wrapReqReplySrvMethod(cap, 'openSiteInChildWindow'),
		// closeSite: jsonSrv.wrapReqReplySrvMethod(cap, 'closeSite'),
		// getSignupToken: jsonSrv.wrapReqReplySrvMethod(cap, 'getSignupToken'),
	} as ExposedObj<DefaultProvider>;
}


