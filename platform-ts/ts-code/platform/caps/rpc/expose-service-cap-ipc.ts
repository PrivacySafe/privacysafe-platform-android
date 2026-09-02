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

import { ExposedFn, Caller, CoreSideServices, ExposedObj, checkRefObjTypeIs, EnvelopeBody } from 'core-3nweb-client-lib/build/ipc';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { errFromMsg, errToMsg, ObjectReference, objRefType } from '../../lib-common/protobuf-msg';
import { ProtoType } from '../../lib-common/protobuf-msg';
import { rpc as pb } from '../../protos/rpc.proto';
import { datumFromSerialFormOnClientSide, datumFromSerialFormOnCoreSide, datumToSerialFormOnClientSide, datumToSerialFormOnCoreSide } from './passed-datum';

type ExposeService = web3n.rpc.service.ExposeService;
type IncomingConnection = web3n.rpc.service.IncomingConnection;
type OutgoingMsg = web3n.rpc.service.OutgoingMsg;
type IncomingMsg = web3n.rpc.service.IncomingMsg;


export namespace exposeService {

	const reqType = ProtoType.for<{ service: string; }>(pb.ExposeSrvRequestBody);

	export function expose(
		fn: ExposeService, expServices: CoreSideServices
	): ExposedFn {
		return buf => {
			const { service } = reqType.unpack(buf);
			const s = new Subject<IncomingConnection>();
			const obs = s.asObservable().pipe(
				map(c => {
					const ref = connection.expose(c, expServices);
					return objRefType.pack(ref);
				})
			);
			const onCancel = fn(service, s);
			return { obs, onCancel };
		};
	}

	export function makeClient(
		caller: Caller, objPath: string[]
	): ExposeService {
		return (service, obs) => {
			const s = new Subject<EnvelopeBody>();
			const unsub = caller.startObservableCall(
				objPath, reqType.pack({ service }), s);
			s.subscribe({
				next: buf => {
					if (obs.next) {
						const ref = objRefType.unpack(buf);
						obs.next(connection.makeCaller(caller, ref));
					}
				},
				complete: obs.complete,
				error: obs.error
			});
			return unsub;
		};
	}

}
Object.freeze(exposeService);


export const provideCAPViaRPC = exposeService;


namespace connection {

	export function expose(
		c: IncomingConnection, expServices: CoreSideServices
	): ObjectReference<'IncomingConnection'> {
		const exp = makeExposedObjForIncomingConnection(c, expServices);
		return expServices.exposeDroppableService('IncomingConnection', exp, c);
	}

	export function makeCaller(
		caller: Caller, ref: ObjectReference<'IncomingConnection'>
	): IncomingConnection {
		checkRefObjTypeIs('IncomingConnection', ref);
		return {
			close: close.makeCaller(caller, ref.path),
			send: send.makeCaller(caller, ref.path),
			watch: watch.makeCaller(caller, ref.path)
		};
	}

	function makeExposedObjForIncomingConnection(
		c: IncomingConnection, expServices: CoreSideServices
	): ExposedObj<IncomingConnection> {
		return {
			close: close.wrapService(c.close),
			send: send.wrapService(c.send, expServices),
			watch: watch.wrapService(c.watch, expServices)
		};
	}


	namespace close {

		export function wrapService(fn: IncomingConnection['close']): ExposedFn {
			return () => {
				const promise = fn();
				return { promise };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): IncomingConnection['close'] {
			const path = objPath.concat('close');
			return () => caller
			.startPromiseCall(path, undefined) as Promise<undefined>;
		}
	
	}
	Object.freeze(close);


	namespace send {

		const msgType = ProtoType.for<OutgoingMsg>(pb.OutgoingMsg);

		export function wrapService(
			fn: IncomingConnection['send'], expServices: CoreSideServices
		): ExposedFn {
			return buf => {
				const msg = unpackMsg(buf, expServices);
				const promise = fn(msg);
				return { promise };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): IncomingConnection['send'] {
			const path = objPath.concat('send');
			return msg => caller
			.startPromiseCall(path, packMsg(msg, caller)) as Promise<undefined>;
		}

		function packMsg(msg: OutgoingMsg, caller: Caller): Buffer {
			if (msg.err) {
				(msg as any).err = errToMsg(msg.err);
			} else {
				msg.data = datumToSerialFormOnClientSide(msg.data, caller);
			}
			return msgType.pack(msg);
		}

		function unpackMsg(
			buf: EnvelopeBody, expServices: CoreSideServices
		): OutgoingMsg {
			const msg = msgType.unpack(buf);
			if (msg.err) {
				(msg as any).err = errFromMsg(msg.err);
			} else {
				msg.data = datumFromSerialFormOnCoreSide(msg.data, expServices);
			}
			return msg;
		}

	}
	Object.freeze(send);


	namespace watch {

		const msgType = ProtoType.for<IncomingMsg>(pb.IncomingMsg);

		export function wrapService(
			fn: IncomingConnection['watch'], expServices: CoreSideServices
		): ExposedFn {
			return () => {
				const s = new Subject<IncomingMsg>();
				const obs = s.asObservable().pipe(
					map(msg => {
						if (msg.msgType === 'start') {
							msg.data = datumToSerialFormOnCoreSide(
								msg.data, expServices
							);
						}
						return msgType.pack(msg);
					})
				);
				const onCancel = fn(s);
				return { obs, onCancel };
			};
		}

		export function makeCaller(
			caller: Caller, objPath: string[]
		): IncomingConnection['watch'] {
			const path = objPath.concat('watch');
			return obs => {
				const s = new Subject<EnvelopeBody>();
				const unsub = caller.startObservableCall(path, undefined, s);
				s.subscribe({
					next: buf => {
						if (obs.next) {
							const msg = msgType.unpack(buf);
							if (msg.msgType === 'start') {
								msg.data = datumFromSerialFormOnClientSide(
									msg.data, caller
								);
							}
							obs.next(msg);
						}
					},
					complete: obs.complete,
					error: obs.error
				});
				return unsub;
			};
		}

	}
	Object.freeze(watch);

}
Object.freeze(connection);


Object.freeze(exports);