/*
 Copyright (C) 2022 - 2023, 2026 3NSoft Inc.
 
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

import { packIntoDatum, unpackDatum } from "./passed-datum";

declare var w3n: web3n.caps.W3N|undefined;
type IncomingConnection = web3n.rpc.service.IncomingConnection;
type IncomingMsg = web3n.rpc.service.IncomingMsg;
type OutgoingMsg = web3n.rpc.service.OutgoingMsg;
type PassedDatum = web3n.rpc.PassedDatum;
type Observer<T> = web3n.Observer<T>;
type ExposeService = web3n.rpc.service.ExposeService;

export type HandleObservingCall = (obs: Observer<any>, ...requestArgs: any[]) => (() => void);

export type HandleReqReplyCall = (...requestArgs: any[]) => Promise<any>;

export interface TransformOpts {
	unpackRequest?: ((req: PassedDatum|undefined) => any[]) | 'noop';
	packReply?: ((reply: any) => PassedDatum|undefined) | 'noop';
}

function surroundWithReqReplySerialization(
	srv: object|undefined, func: HandleReqReplyCall, transforms: TransformOpts|undefined
): ReqReplyHandler {
	return async requestData => {
		const args = argsFromPassedDatum(requestData, transforms?.unpackRequest);
		const result = (args ?
			await func.call(srv, ...args) :
			await func.call(srv)
		);
		return fnResultToPassedDatum(result, transforms?.packReply);
	};
}

function argsFromPassedDatum(
	data: PassedDatum|undefined, unpack: TransformOpts['unpackRequest']
): (any[])|undefined {
	if (!data) { return; }
	if (unpack) {
		return ((unpack === 'noop') ? [ data.bytes ] : unpack(data));
	} else {
		return unpackDatum(data);
	}
}

function fnResultToPassedDatum(data: any, pack: TransformOpts['packReply']): PassedDatum|undefined {
	if (data === undefined) { return; }
	if (pack) {
		if (pack === 'noop') {
			if (!ArrayBuffer.isView(data)) {
				throw new Error(`Method returned non-binary, while no serialization is set`);
			}
			return { bytes: data as Uint8Array };
		}
		return pack(data);
	} else {
		return packIntoDatum(data);
	}
}

type ReqReplyHandler = (
	req: PassedDatum|undefined
) => Promise<PassedDatum|undefined>;

function surroundObsWithSerialization(
	srv: object|undefined, func: HandleObservingCall,
	transforms: TransformOpts|undefined
): ObservableHandler {
	return (requestData, obs) => {
		const args = argsFromPassedDatum(requestData, transforms?.unpackRequest);
		const obsWrap: Observer<any> = {
			next: ev => obs.next!(fnResultToPassedDatum(ev, transforms?.packReply)),
			complete: obs.complete,
			error: obs.error
		};
		return (args ?
			func.call(srv, obsWrap, ...args) :
			func.call(srv, obsWrap)
		);
	};
}

type ObservableHandler = (
	req: PassedDatum|undefined, obs: Observer<PassedDatum|undefined>
) => (() => void);


class ConnectionState {

	private readonly calls = new Map<number, { cancel?: () => void; }>();
	private isRunning = true;

	constructor(
		private readonly disconnect: () => void
	) {}

	acceptsMsgs(): boolean {
		return this.isRunning;
	}

	stop(): void {
		if (!this.isRunning) { return; }
		this.isRunning = false;
		this.disconnect();
		for (const { cancel } of this.calls.values()) {
			if (cancel) {
				cancel();
			}
		}
		this.calls.clear();
	}

	hasCall(callNum: number): boolean {
		return this.calls.has(callNum);
	}

	cancelCall(callNum: number): void {
		const call = this.calls.get(callNum);
		if (!call) { return; }
		this.calls.delete(callNum);
		if (call.cancel) {
			call.cancel();
		}
	}

	completeCall(callNum: number): void {
		this.calls.delete(callNum);
	}

	registerReqReplyCall(callNum: number): void {
		this.calls.set(callNum, {});
	}

	registerObservableCall(callNum: number, cancel: () => void): void {
		this.calls.set(callNum, { cancel });
	}

}


export abstract class IPCWrap {

	protected readonly connections = new Map<IncomingConnection, ConnectionState>();
	private readonly methods = new Map<string, {
		obs?: ObservableHandler; reqRep?: ReqReplyHandler;
	}>();

	constructor(
		public readonly srvName: string,
		private readonly logErrorsToConsole: boolean
	) {}

	addReqReplyMethod(
		method: string, srv: object|undefined, func: HandleReqReplyCall,
		transforms?: TransformOpts
	): void {
		this.methods.set(method, {
			reqRep: surroundWithReqReplySerialization(srv, func, transforms)
		});
	}

	exposeReqReplyMethods<T extends object>(
		srv: T, methods: (keyof T)[],
		transforms?: { [method in keyof T]: TransformOpts; }
	): void {
		for (const method of methods) {
			const func = srv[method] as HandleReqReplyCall;
			if (typeof func !== 'function') {
				throw new Error(`Given service object has no method ${method as string}`);
			}
			this.addReqReplyMethod(
				method as string, srv, func,
				(transforms ? transforms[method] : undefined)
			);
		}
	}

	addObservableMethod(
		method: string, srv: object|undefined, func: HandleObservingCall,
		transforms?: TransformOpts
	): void {
		this.methods.set(method, {
			obs: surroundObsWithSerialization(srv, func, transforms)
		});
	}

	exposeObservableMethods<T extends object>(
		srv: T, methods: (keyof T)[],
		transforms?: { [method in keyof T]: TransformOpts; }
	): void {
		for (const method of methods) {
			const func = srv[method] as HandleObservingCall;
			if (typeof func !== 'function') {
				throw new Error(`Given service object has no method ${method as string}`);
			}
			this.addObservableMethod(
				method as string, srv, func,
				(transforms ? transforms[method] : undefined)
			);
		}
	}

	private async onMsg(
		connection: IncomingConnection, connectionState: ConnectionState,
		msg: IncomingMsg
	): Promise<void> {
		if (!connectionState.acceptsMsgs()) { return; }
		if (msg.msgType === 'start') {
			const { callNum, method, data: requestData } = msg;
			if (connectionState.hasCall(callNum)) { return; }
			const m = this.methods.get(method);
			if (!m) {
				await connection.send({
					callNum, callStatus: 'error', err: `Method ${method} not found`
				});
				return;
			}
			const { obs, reqRep } = m;
			if (reqRep) {
				connectionState.registerReqReplyCall(callNum);
				await this.callReqReplyHandler(
					connection, connectionState, method, reqRep, callNum, requestData
				);
			} else if (obs) {
				const cancelCall = this.callObsHandler(
					connection, connectionState, method, obs, callNum, requestData
				);
				connectionState.registerObservableCall(callNum, cancelCall);
			}
		} else if (msg.msgType === 'cancel') {
			const { callNum } = msg;
			connectionState.cancelCall(callNum);
		}
	}

	private async callReqReplyHandler(
		connection: IncomingConnection, connectionState: ConnectionState,
		method: string, reqRep: ReqReplyHandler,
		callNum: number, requestData: PassedDatum|undefined
	): Promise<void> {
		let reply: OutgoingMsg;
		try {
			const data = await reqRep(requestData);
			reply = {
				callNum, callStatus: 'end', data
			};
		} catch (err) {
			reply = {
				callNum, callStatus: 'error', err
			};
			if (this.logErrorsToConsole) {
				console.error(`Exposed service ${this.srvName} throws exception within a remote call to method ${method}`, err);
			}
		}
		if (!connectionState.hasCall(callNum)) { return; }
		connectionState.completeCall(callNum);
		await connection.send(reply);
	}

	private callObsHandler(
		connection: IncomingConnection, connectionState: ConnectionState,
		method: string, obs: ObservableHandler,
		callNum: number, requestData: PassedDatum|undefined
	): () => void {
		return obs(requestData, {
			next: data => connection.send({
				callNum, callStatus: 'interim', data
			}),
			complete: async () => {
				if (!connectionState.hasCall(callNum)) { return; }
				connectionState.completeCall(callNum);
				await connection.send({
					callNum, callStatus: 'end'
				});
			},
			error: async err => {
				if (!connectionState.hasCall(callNum)) { return; }
				connectionState.completeCall(callNum);
				await connection.send({
					callNum, callStatus: 'error', err
				});
				if (this.logErrorsToConsole) {
					console.error(`Exposed service ${this.srvName} throws exception into a remote observer from a method ${method}`, err);
				}
			}
		});
	}

	startIPC(exposeService?: ExposeService): () => void {
		return (exposeService ?? w3n?.rpc!.exposeService!)(this.srvName, {
			next: connection => this.onConnection(connection),
			complete: () => this.onListeningCompletion(),
			error: err => this.onListeningError(err)
		});
	}

	stopIPC(): void {
		for (const connectionState of this.connections.values()) {
			connectionState.stop();
		}
		this.connections.clear();
	}

	protected async onConnection(
		connection: IncomingConnection
	): Promise<void> {
		const disconnect = connection.watch({
			next: msg => this.onMsg(connection, connectionState, msg),
			complete: () => this.onConnectionCompletion(
				connection, connectionState
			),
			error: err => this.onConnectionError(connection, connectionState, err)
		});
		const connectionState = new ConnectionState(() => {
			this.connections.delete(connection);
			disconnect();
		});
		this.connections.set(connection, connectionState);
	}

	protected async onConnectionCompletion(
		connection: IncomingConnection, connectionState: ConnectionState
	): Promise<void> {
		this.connections.delete(connection);
		connectionState.stop();
	}

	protected async onConnectionError(
		connection: IncomingConnection, connectionState: ConnectionState, err: any
	): Promise<void> {
		this.connections.delete(connection);
		connectionState.stop();
	}

	protected abstract onListeningCompletion(): Promise<void>;

	protected abstract onListeningError(err: any): Promise<void>;

}


export class SingleConnectionIPCWrap extends IPCWrap {

	constructor(
		srvName: string,
		private readonly closeSelf: () => void,
		logErrorsToConsole = false
	) {
		super(srvName, logErrorsToConsole);
	}

	protected async onListeningCompletion(): Promise<void> {
		this.closeSelf();
	}

	protected async onListeningError(err: any): Promise<void> {
		if (w3n?.log) {
			await w3n.log(
				'error', `Error in listening for incoming connections`, err
			);
		}
		this.closeSelf();
	}

	protected async onConnectionCompletion(
		connection: IncomingConnection, connectionState: ConnectionState
	): Promise<void> {
		super.onConnectionCompletion(connection, connectionState);
		this.closeSelf();
	}

	protected async onConnectionError(
		connection: IncomingConnection, connectionState: ConnectionState, err: any
	): Promise<void> {
		super.onConnectionError(connection, connectionState, err);
		if (w3n?.log) {
			await w3n.log(
				'error', `Error in listening for calls`, err
			);
		}
		this.closeSelf();
	}
}


export class MultiConnectionIPCWrap extends IPCWrap {

	constructor(srvName: string, logErrorsToConsole = false) {
		super(srvName, logErrorsToConsole);
	}

	protected async onListeningCompletion(): Promise<void> {}

	protected async onListeningError(err: any): Promise<void> {
		if (w3n?.log) {
			await w3n.log(
				'error', `Error in listening for incoming connections`, err
			);
		}
	}

	protected async onConnectionError(
		connection: IncomingConnection, connectionState: ConnectionState, err: any
	): Promise<void> {
		super.onConnectionError(connection, connectionState, err);
		if (w3n?.log) {
			await w3n.log(
				'error', `Error in listening for calls`, err
			);
		}
	}

}
