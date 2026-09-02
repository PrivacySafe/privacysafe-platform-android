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

import { toBuffer } from "../../platform/lib-common/buffer-utils";
import { stringifyErr } from "../../platform/lib-common/exceptions/error";
import { defer, Deferred } from "../../platform/lib-common/processes/deferred";
import { ProtoType } from "../../platform/lib-common/protobuf-msg";
import { fn_calls as pb } from '../protos/fn-calls.proto';

interface Android {
  consumeNamedDataAsArrayBuffer?: (dataId: string) => Promise<Uint8Array>;
  getNamedPort?: (portId: string) => Promise<MessagePort>;
}

declare var android: Android|undefined;

export interface MsgSender {
	send: (msg: Uint8Array) => void;
	close: () => void;
}

async function makeMsgSenderViaMsgPort(
	portName: string, onMsg: (msg: Uint8Array) => void
): Promise<MsgSender> {
	const port = await android!.getNamedPort!(portName);
	port.onmessage = ev => {
try {
		if (ev.data instanceof ArrayBuffer) {
			onMsg(new Uint8Array(ev.data));
		} else {
			console.error(`Binary port ${portName} received a non-binary message from Android side.`);
		}
} catch (exc) {
	console.error(`error in handling message from port`, ev ,`\nerror:`, exc);
	throw exc;
}
	};
	port.onmessageerror = ev => {
		console.error(`error event in port`, ev.data);
	};
	return {
		send: msg => {
			try {
				// XXX note on this array copy before sending it via MessagePort port.
				//  Without copying things stop working. Errors are swallowed, but same browserified protobuf code
				//  in WebView was observed:
				//  - protobuf throws "TypeError: Cannot perform Construct on a detached ArrayBuffer" from
				//    Writer.pool_alloc.
				//  - pool in the name suggests some reuse. But arrays get detached when sent from port.
				//  - thus, a guess to add copy here, .... and it works. But code looks nasty.
				const copy = new Uint8Array(msg.length);
				copy.set(msg);
				port.postMessage(copy.buffer);
			} catch (err) {
				console.error(err.message, '\n', err.stack);
			}
		},
		close: () => port.close()
	};
}

interface MsgBucket {
	fromJS: string[];
	onMsg: (msg: Uint8Array) => void;
}

const namedDataType = ProtoType.for<{
	portName: string;
	data: Uint8Array;
}>(pb.NamedData);

const markerInConsoleInfo = '~*~';

async function makeMsgSenderViaNamedData(
	portName: string, onMsg: (msg: Uint8Array) => void
): Promise<MsgSender> {
	if ((globalThis as any)._ipc_msg_buckets.has(portName)) {
		throw new Error(`Port ${portName} already exists, and new one can't be added`);
	}
	const bucket: MsgBucket = { fromJS: [], onMsg };
	(globalThis as any)._ipc_msg_buckets.set(portName, bucket);
	const notificationMsg = `${markerInConsoleInfo}${portName}${markerInConsoleInfo}`;
	return {
		send: data => {
			const b64 = ((data as any).toBase64 ? (data as any).toBase64() : toBuffer(data).toString('base64'));
			bucket.fromJS.push(b64);
			console.info(notificationMsg);
		},
		close: () => {}
	};
}

export const openBinaryMsgPort: (
	portName: string, onMsg: (msg: Uint8Array) => void
) => Promise<MsgSender> = (function() {
	if (typeof android?.getNamedPort == 'function') {
		return makeMsgSenderViaMsgPort;
	} else if (typeof android?.consumeNamedDataAsArrayBuffer === 'function') {

		if (!(globalThis as any)._ipc_msg_buckets) {
			(globalThis as any)._ipc_msg_buckets = new Map<string, MsgBucket>();

			(globalThis as any)._ipc_consume_named = (dataId: string): void => {
				android!.consumeNamedDataAsArrayBuffer!(dataId)
				.then(async (bytes) => {
					const { data, portName } = namedDataType.unpack(Buffer.from(bytes));
					const bucket = (globalThis as any)._ipc_msg_buckets.get(portName);
					if (!bucket) {
						throw new Error(`Port ${portName} is unknown`);
					}
					try {
						bucket.onMsg(data);
					} catch (err) {
						console.error(err.message, '\n', err.stack);
					}
				})
				.catch(err => {
					console.error(err);
				});
			};

			(globalThis as any)._ipc_extract_msg = (portName: string): string|undefined => {
				const bucket = (globalThis as any)._ipc_msg_buckets.get(portName);
				if (!bucket) {
					throw new Error(`Port ${portName} is unknown`);
				}
				return bucket.fromJS.shift();
			};

		}
		return makeMsgSenderViaNamedData;

	} else {

		throw `Need implementation of msg passing byte arrays`;

	}
})();

/**
 * This should be used in app component, to setup port for communication with core.
 */
export function makeIpcToCore(onMsgFromCore: (msg: Uint8Array) => void): Promise<MsgSender> {
	return openBinaryMsgPort('ipc-to-core', onMsgFromCore);
}

interface CallIntoAndroid {
	id: number;
	args?: Buffer;
}
const callIntoAndroidType = ProtoType.for<CallIntoAndroid>(pb.RequestWithinCallIntoAndroid);

interface CallReply {
	id: number;
	res: Buffer;
	err?: string;
}
const callReplyType = ProtoType.for<CallReply>(pb.ReplyWithinCall);

function makeDeferredCallsIntoAndroid(deserializeErr: ((err: string) => unknown)|undefined): {
	completeCall: (id: number, res: Buffer, err: string|undefined) => void;
	newCall: () => { id: number; promise: Promise<Buffer>; };
} {
	const calls = new Map<number, Deferred<Buffer>>();
	let counter = 0;
	return {

		newCall: () => {
			do {
				counter += 1;
				if (counter >= 0x3fffffff) {
					counter = 1;
				}
			} while (calls.has(counter));
			const id = counter;
			const call = defer<Buffer>();
			calls.set(id, call);
			return { id, promise: call.promise };
		},

		completeCall: (id, res, err) => {
			const call = calls.get(id);
			if (call) {
				calls.delete(id);
				if (err && (err.length > 0)) {
					if (deserializeErr) {
						try {
							call.reject(deserializeErr(err));
						} catch (_) {
							call.reject(err);
						}
					} else {
						call.reject(err);
					}
				} else {
					call.resolve(res);
				}
			}
		}

	};
}

export type AndroidFnWrap = (args?: Buffer) => Promise<Buffer>;

export function wrapFnOnAndroidSide(
	portName: string,
	deserializeErr?: (err: string) => unknown
): AndroidFnWrap {
	const { newCall, completeCall } = makeDeferredCallsIntoAndroid(deserializeErr);

	let send: MsgSender['send']|undefined = undefined;
	let init: Promise<MsgSender['send']>|undefined = openBinaryMsgPort(
		portName,
		msg => {
			const { id, res, err } = callReplyType.unpack(toBuffer(msg));
			completeCall(id, res, err);
		}
	).then(sender => {
		send = sender.send;
		init = undefined;
		return send;
	});

	return async args => {
		const { id, promise } = newCall();
		const msg = callIntoAndroidType.pack({ id, args: args ?? Buffer.alloc(0) });
		(send ?? await init!)(msg);
		return promise;
	};
}

export function utf8StringFromBytes(bytes: Uint8Array): string {
  return toBuffer(bytes).toString('utf8');
}

export function stringToUtf8Bytes(str: string): Uint8Array {
  return Buffer.from(str, 'utf8');
}

const FNS_FOR_ANDROID_PORT_NAME = 'fns-for-android';

interface CallIntoJS {
	id: number;
	fnName: string;
	args: Buffer;
}
const callIntoJSType = ProtoType.for<CallIntoJS>(pb.RequestWithinCallIntoJS);

export const fnsForAndroid = (function makePortToExposeFnsToAndroid(): {
	exposeFn: <TArgs extends object, TRes extends object>(
		fn: (args?: TArgs) => Promise<TRes|void>, argsType: ProtoType<TArgs>|undefined, resType: ProtoType<TRes>|undefined
	) => void;
	removeFn: (fn: Function) => void;
	close: () => void;
} {
	let fnsForAndroid: ReturnType<typeof makePortToExposeFnsToAndroid> = (globalThis as any)._ipc_fns_to_call_android;
	if (!fnsForAndroid) {
		const fns = new Map<string, { fn: Function; argsType?: ProtoType<any>; resType?: ProtoType<any>; }>();
		let closePort: (() => void)|undefined = undefined;
		let sendReply: MsgSender['send']|undefined = undefined;

		openBinaryMsgPort(FNS_FOR_ANDROID_PORT_NAME, async msg => {
			const { fnName, id, args } = callIntoJSType.unpack(toBuffer(msg));
			const op = fns.get(fnName);
			const rep = { id, err: '' } as CallReply;
			if (op) {
				try {
					const { argsType, fn, resType } = op;
					const res = await fn(argsType?.unpack(args));
					rep.res = (res ? (resType ? resType.pack(res) : res) : Buffer.alloc(0));
				} catch (err) {
					rep.res = Buffer.alloc(0);
					rep.err = stringifyErr(err);
				}
			} else {
				rep.res = Buffer.alloc(0);
				rep.err = `Function ${fnName} is not exposed on JS side.`;
			}
			sendReply?.(callReplyType.pack(rep));
		}).then(({ send, close }) => {
			closePort = close;
			sendReply = send;
		});

		fnsForAndroid = {
			exposeFn: (fn, argsType, resType) => {
				if (fns.has(fn.name)) {
					throw new Error(`Some function is already exposed as ${fn.name}`);
				}
				fns.set(fn.name, { fn, argsType, resType });
			},
			removeFn: fn => {
				if (fns.get(fn.name)?.fn === fn) {
					fns.delete(fn.name)
				}
			},
			close: () => closePort?.()
		};
		(globalThis as any)._ipc_fns_to_call_android = fnsForAndroid;
	}
	return fnsForAndroid;
})();

export interface BooleanValue {
	value: boolean;
}
export const booleanValueType = ProtoType.for<BooleanValue>(pb.BooleanValue);

export interface IntValue {
	value: number;
}
export const intValueType = ProtoType.for<IntValue>(pb.IntValue);

export interface StringValue {
	value: string;
}
export const stringValueType = ProtoType.for<StringValue>(pb.StringValue);

export interface StringArrayValue {
	values: string[];
}
export const stringArrayValueType = ProtoType.for<StringArrayValue>(pb.StringArrayValue);
