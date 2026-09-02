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

import { ExposedFn, Caller, ExposedObj, checkRefObjTypeIs, CoreSideServices } from 'core-3nweb-client-lib/build/ipc';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { ObjectReference, objRefType, ProtoType } from '../../lib-common/protobuf-msg';
import { rpc as pb } from '../../protos/rpc.proto';
import { SerialFormOfPassedData, datumFromSerialFormOnClientSide, datumFromSerialFormOnCoreSide, datumToSerialFormOnClientSide, datumType, packDatumOnCoreSide, unpackDatumOnClientSide } from './passed-datum';

type AppRPC = web3n.rpc.client.AppRPC;
type OtherAppsRPC = web3n.rpc.client.OtherAppsRPC;
type RPCConnection = web3n.rpc.client.RPCConnection;
type PassedDatum = web3n.rpc.PassedDatum;


export namespace thisAppRPC {

	const reqType = ProtoType.for<{ service: string; }>(pb.AppRPCRequestBody);

	export function expose(
		fn: AppRPC, expServices: CoreSideServices
	): ExposedFn {
		return buf => {
			const { service } = reqType.unpack(buf);
			const promise = fn(service)
			.then(c => {
				const ref = rpcConnection.expose(c, expServices);
				return objRefType.pack(ref);
			});
			return { promise };
		};
	}

	export function makeClient(caller: Caller, objPath: string[]): AppRPC {
		return service => caller
		.startPromiseCall(objPath, reqType.pack({ service }))
		.then(buf => {
			const ref = objRefType.unpack(buf);
			return rpcConnection.makeCaller(caller, ref);
		});
	}

}

export namespace otherAppsRPC {

	const reqType = ProtoType.for<{
		appDomain: string, service: string;
	}>(pb.OtherAppsRPCRequestBody);

	export function expose(
		fn: OtherAppsRPC, expServices: CoreSideServices
	): ExposedFn {
		return buf => {
			const { appDomain, service } = reqType.unpack(buf);
			const promise = fn(appDomain, service)
			.then(c => {
				const ref = rpcConnection.expose(c, expServices);
				return objRefType.pack(ref);
			});
			return { promise };
		};
	}

	export function makeClient(caller: Caller, objPath: string[]): OtherAppsRPC {
		return (appDomain, service) => caller
		.startPromiseCall(objPath, reqType.pack({ appDomain, service }))
		.then(buf => {
			const ref = objRefType.unpack(buf);
			return rpcConnection.makeCaller(caller, ref);
		});
	}

}

export namespace capViaRPC {

	export function expose(
		fn: () => Promise<RPCConnection>, expServices: CoreSideServices
	): ExposedFn {
		return buf => {
			const promise = fn()
			.then(c => {
				const ref = rpcConnection.expose(c, expServices);
				return objRefType.pack(ref);
			});
			return { promise };
		};
	}

	export function makeClient(caller: Caller, objPath: string[]): () => Promise<RPCConnection> {
		return () => caller
		.startPromiseCall(objPath, undefined)
		.then(buf => {
			const ref = objRefType.unpack(buf);
			return rpcConnection.makeCaller(caller, ref);
		});
	}

}


namespace rpcConnection {

	export function expose(
		c: RPCConnection, expServices: CoreSideServices
	): ObjectReference<'RPCConnection'> {
		const exp: ExposedObj<RPCConnection> = {
			close: close.wrapService(c.close),
			makeRequestReplyCall: makeRequestReplyCall.wrapService(c.makeRequestReplyCall, expServices),
			startObservableCall: startObservableCall.wrapService(c.startObservableCall, expServices)
		};
		return expServices.exposeDroppableService('RPCConnection', exp, c);
	}

	export function makeCaller(
		caller: Caller, ref: ObjectReference<'RPCConnection'>
	): RPCConnection {
		checkRefObjTypeIs('RPCConnection', ref);
		return {
			close: close.makeCaller(caller, ref.path),
			makeRequestReplyCall: makeRequestReplyCall.makeCaller(caller, ref.path),
			startObservableCall: startObservableCall.makeCaller(caller, ref.path)
		};
	}

	const callStartType = ProtoType.for<{
		method: string; req?: SerialFormOfPassedData;
	}>(pb.CallStartRequestBody);


	namespace close {

		export function wrapService(fn: RPCConnection['close']): ExposedFn {
			return () => {
				const promise = fn();
				return { promise };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): RPCConnection['close'] {
			const path = objPath.concat('close');
			return () => caller
			.startPromiseCall(path, undefined) as Promise<undefined>;
		}
	
	}
	Object.freeze(close);


	namespace makeRequestReplyCall {

		export function wrapService(
			fn: RPCConnection['makeRequestReplyCall'],
			expServices: CoreSideServices
		): ExposedFn {
			return buf => {
				const { method, req } = callStartType.unpack(buf);
				const promise = fn(method, datumFromSerialFormOnCoreSide(req, expServices))
				.then(d => packDatumOnCoreSide(d, expServices));
				return { promise };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): RPCConnection['makeRequestReplyCall'] {
			const path = objPath.concat('makeRequestReplyCall');
			return async (method, req) => {
				const reqBuf = callStartType.pack({
					method, req: datumToSerialFormOnClientSide(req, caller)
				});
				const repBuf = await caller.startPromiseCall(path, reqBuf);
				return unpackDatumOnClientSide(repBuf, caller);
			};
		}

	}
	Object.freeze(makeRequestReplyCall);


	namespace startObservableCall {

		export function wrapService(
			fn: RPCConnection['startObservableCall'], expServices: CoreSideServices
		): ExposedFn {
			return buf => {
				const { method, req } = callStartType.unpack(buf);
				const s = new Subject<PassedDatum>();
				const obs = s.asObservable()
				.pipe(
					map(d => packDatumOnCoreSide(d, expServices))
				);
				const onCancel = fn(
					method, datumFromSerialFormOnCoreSide(req, expServices), s
				);
				return { obs, onCancel };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): RPCConnection['startObservableCall'] {
			const path = objPath.concat('startObservableCall');
			return (method, req, obs) => {
				const s = new Subject<Buffer>();
				const unsub = caller.startObservableCall(
					path, callStartType.pack({ method, req }), s);
				s.subscribe({
					next: buf => {
						if (obs.next) {
							obs.next(unpackDatumOnClientSide(buf, caller));
						}
					},
					complete: obs.complete,
					error: obs.error
				});
				return unsub;
			};
		}

	}
	Object.freeze(startObservableCall);

}
Object.freeze(rpcConnection);


Object.freeze(exports);