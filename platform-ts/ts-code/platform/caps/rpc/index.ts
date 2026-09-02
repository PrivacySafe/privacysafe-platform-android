/*
 Copyright (C) 2022, 2024 3NSoft Inc.
 
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

import { Component, Service } from '../../inject-defs/apps';
import { isCallerAllowed, makeRPCException } from '../../lib-common/manifest-utils';
import { Deferred, defer } from '../../lib-common/processes/deferred';
import { callWithTimeout } from '../../lib-common/processes/timeouts';

type PassedDatum = web3n.rpc.PassedDatum;
type Datum = PassedDatum|undefined;
type RPCConnection = web3n.rpc.client.RPCConnection;
type IncomingConnection = web3n.rpc.service.IncomingConnection;
type IncomingMsg = web3n.rpc.service.IncomingMsg;
type OutgoingMsg = web3n.rpc.service.OutgoingMsg;
type Observer<T> = web3n.Observer<T>;
type AllowedCallers = web3n.caps.AllowedCallers;
type RPCException = web3n.rpc.RPCException;
type OpenConnectionInfo = web3n.system.monitor.OpenConnectionInfo;

export type GetServiceToHandleNewCall = (
	caller: Component, appDomain: string, service: string
) => Promise<Service>;

export type ClientSideConnector = (
	caller: Component, appDomain: string, service: string
) => Promise<{
	connection: RPCConnection;
	doOnClose: (cleanup: ()=>void) => void;
}>;

export function makeClientSideConnector(
	srvToHandleCall: GetServiceToHandleNewCall
): ClientSideConnector {
	return async (caller, appDomain, service) => {
		const instance = await srvToHandleCall(caller, appDomain, service);
		return await callWithTimeout(
			() => instance.connect(caller.domain, caller.entrypoint),
			10000,
			() => `Timeout in connecting to service ${service} from app ${appDomain}`
		);
	};
}


class Connection {

	private nextCallNum = 1;
	private readonly calls = new Map<number, Deferred<Datum>|Observer<Datum>>();
	private initBuffer: IncomingMsg[]|undefined = [];
	private srvSink: Observer<IncomingMsg>|undefined = undefined;
	private readonly onCloseFns = new Set<()=>void>();

	constructor(
		public readonly appId: string,
		public readonly srvName: string,
		public readonly callerApp: string,
		public readonly callerComponent: string
	) {
		Object.seal(this);
	}

	makePair(): {
		clientSide: RPCConnection; srvSide: IncomingConnection;
	} {
		const close = this.close.bind(this);
		const srvSide: IncomingConnection = {
			close,
			send: this.send.bind(this),
			watch: this.watch.bind(this),
		};
		const clientSide: RPCConnection = {
			close,
			makeRequestReplyCall: this.makeRequestReplyCall.bind(this),
			startObservableCall: this.startObservableCall.bind(this),
		};
		return {
			clientSide, srvSide
		};
	}

	readonly doOnClose = (cleanup: ()=>void): void => {
		this.onCloseFns.add(cleanup);
	};

	async close(): Promise<void> {
		if (!this.acceptsMsgs()) { return; }
		this.initBuffer = undefined;
		if (this.srvSink) {
			this.srvSink.complete!();
			this.srvSink = undefined;
		}
		if (this.calls.size === 0) { return; }
		const exc = this.makeExc({ connectionClosed: true });
		for (const [ callNum, call ] of Array.from(this.calls.entries())) {
			this.calls.delete(callNum);
			if ((call as Deferred<PassedDatum>).promise) {
				(call as Deferred<PassedDatum>).reject(exc);
			} else {
				(call as Observer<PassedDatum>).error!(exc);
			}
		}
		for (const cleanup of this.onCloseFns) {
			cleanup();
		}
	}

	private numForCall(): number {
		let callNum: number;
		do {
			callNum = this.nextCallNum;
			if (this.nextCallNum >= 0xffffffff) {
				this.nextCallNum = 1;
			} else {
				this.nextCallNum += 1;
			}
		} while (this.calls.has(callNum));
		return callNum;
	}

	private passToService(msg: IncomingMsg): void {
		if (this.initBuffer) {
			this.initBuffer.push(msg);
		} else {
			this.srvSink!.next!(msg);
		}
	}

	acceptsMsgs(): boolean {
		return !!(this.srvSink || this.initBuffer);
	}

	watch(obs: Observer<IncomingMsg>): () => void {
		if (!this.acceptsMsgs()) {
			obs.complete!();
			return noop;
		}
		if (this.srvSink) {
			throw this.makeExc({ connectionAlreadyWatched: true });
		}
		this.srvSink = obs;
		this.drainInitBuffer();
		return () => this.close();
	}

	private drainInitBuffer(): void {
		process.nextTick(() => {
			if (!this.initBuffer) { return; }
			const msg = this.initBuffer.shift();
			if (!msg) {
				this.initBuffer = undefined;
				return;
			}
			if (!this.srvSink) { return; }
			this.srvSink.next!(msg);
			this.drainInitBuffer();
		});
	}

	private makeExc(
		flags: Partial<RPCException>, params?: Partial<RPCException>
	): RPCException {
		return makeRPCException(this.appId, this.srvName, flags, params);
	}

	async send({ callNum, callStatus, data, err }: OutgoingMsg): Promise<void> {
		const call = this.calls.get(callNum);
		if (!call) { return; }
		if ((call as Deferred<Datum>).promise) {
			if (callStatus === 'end') {
				(call as Deferred<Datum>).resolve(data);
			} else if (callStatus === 'error') {
				(call as Deferred<Datum>).reject(err);
			} else {
				(call as Deferred<Datum>).reject(this.makeExc({}, {
					message: `Unexpected call status ${
						callStatus} for request-reply call`
				}));
			}
			this.calls.delete(callNum);
		} else {
			if (callStatus === 'interim') {
				(call as Observer<Datum>).next!(data);
			} else if (callStatus === 'end') {
				(call as Observer<Datum>).complete!();
				this.calls.delete(callNum);
			} else if (callStatus === 'error') {
				(call as Observer<Datum>).error!(err);
				this.calls.delete(callNum);
			} else {
				(call as Deferred<Datum>).reject(this.makeExc({}, {
					message: `Unexpected call status ${
						callStatus} for request-reply call`
				}));
				this.calls.delete(callNum);
			}
		}
	}

	makeRequestReplyCall(
		method: string, req: Datum
	): Promise<Datum> {
		if (!this.acceptsMsgs()) {
			throw Promise.reject(this.makeExc({ connectionClosed: true }));
		}
		const deferred = defer<Datum>();
		const callNum = this.numForCall();
		this.calls.set(callNum, deferred);
		this.passToService({
			msgType: 'start', callNum, method, data: req
		});
		return deferred.promise;
	}

	startObservableCall(
		method: string, req: Datum, obs: Observer<Datum>
	): () => void {
		if (!this.acceptsMsgs()) {
			obs.error!(this.makeExc({ connectionClosed: true }));
			return noop;
		}
		const callNum = this.numForCall();
		this.calls.set(callNum, obs);
		this.passToService({
			msgType: 'start', callNum, method, data: req
		});
		return () => {
			this.calls.delete(callNum);
			this.passToService({ msgType: 'cancel', callNum });
		};
	}

}
Object.freeze(Connection.prototype);
Object.freeze(Connection);


export class ServiceConnector implements Service {

	private connectionSink: Observer<IncomingConnection>|undefined = undefined;
	private  deferredSink: Deferred<Observer<IncomingConnection>>|undefined = defer();
	private acceptingCalls = true;
	private readonly connections = new Set<Connection>();

	constructor(
		public readonly appDomain: string,
		public readonly srvName: string,
		private readonly allowedCallers: AllowedCallers,
		private readonly forOneConnectionOnly: boolean,
	) {
		Object.seal(this);
	}

	wrap(): Service {
		return {
			canHandleCall: this.canHandleCall.bind(this),
			ensureCallerAllowed: this.ensureCallerAllowed.bind(this),
			connect: this.connect.bind(this),
			listOpenConnections: this.listOpenConnections.bind(this)
		};
	}

	canHandleCall(): boolean {
		return this.acceptingCalls;
	}

	private async getConnectionSink(): Promise<Observer<IncomingConnection>> {
		if (this.connectionSink) {
			return this.connectionSink;
		} else {
			return await this.deferredSink!.promise;
		}
	}

	ensureCallerAllowed(callerApp: string, callerComponent: string): void {
		if (!isCallerAllowed(this.appDomain, this.allowedCallers, callerApp, callerComponent)) {
			throw makeRPCException(
				this.appDomain, this.srvName,
				{ callerNotAllowed: true },
				{ callerApp, callerComponent }
			);
		}
	}

	setSinkForConnections(sink: Observer<IncomingConnection>): void {
		if (!this.connectionSink && this.deferredSink) {
			this.connectionSink = sink;
			this.deferredSink.resolve(sink);
			this.deferredSink = undefined;
		} else {
			throw this.makeExc({ serviceAlreadyExposed: true });
		}
	}

	private makeExc(flags: Partial<RPCException>): RPCException {
		return makeRPCException(this.appDomain, this.srvName, flags);
	}

	async connect(callerApp: string, callerComponent: string): Promise<{
		connection: RPCConnection;
		doOnClose: (cleanup: ()=>void) => void;
	}> {
		this.ensureCallerAllowed(callerApp, callerComponent);
		if (this.acceptingCalls) {
			if (this.forOneConnectionOnly) {
				this.acceptingCalls = false;
			}
		} else {
			throw this.makeExc({ connectionNotAccepted: true });
		}
		const srvSideSink = await this.getConnectionSink();
		const connection = new Connection(this.appDomain, this.srvName, callerApp, callerComponent);
		this.connections.add(connection);
		connection.doOnClose(() => this.connections.delete(connection));
		const { srvSide, clientSide } = connection.makePair();
		srvSideSink.next!(srvSide);
		return { connection: clientSide, doOnClose: connection.doOnClose };
	}

	listOpenConnections(entrypoint: string): OpenConnectionInfo[] {
		const lst: OpenConnectionInfo[] = [];
		for (const c of this.connections) {
			if (!c.acceptsMsgs()) {
				continue;
			}
			lst.push({
				service: this.srvName,
				entrypoint,
				caller: ((c.callerApp === c.appId) ?
					{
						thisAppComponent: c.callerComponent
					} :
					{
						otherApp: {
							appId: c.callerApp,
							component: c.callerComponent
						}
					}
				)
			});
		}
		return lst;
	}

	close(): void {
		if (!this.acceptingCalls) { return; }
		this.acceptingCalls = false;
		if (this.connectionSink) {
			this.connectionSink.complete!();
			this.connectionSink = undefined;
		}
		if (this.deferredSink) {
			this.deferredSink.promise.then(srv => srv.complete!()).catch(noop);
			this.deferredSink = undefined;
		}
	}

}
Object.freeze(ServiceConnector.prototype);
Object.freeze(ServiceConnector);


function noop() {}


Object.freeze(exports);