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

import { msgProtoType } from "core-3nweb-client-lib/build/ipc";
import { InitIPC } from "./ipc-type";
import { toBuffer } from "../../platform/lib-common/buffer-utils";

const androidIPC: {
  setupPort: () => void;
  listObjPath: (pathJSON: string) => string;
	canSendBuffer: () => boolean;
} = window["_ipc_"];
window["_ipc_"] = undefined;

export type OnMsg = (msg: Uint8Array) => void;

function noop() {}

let onMsgToJS: OnMsg = noop;
let sendToCore: OnMsg = msg => deferredSetup?.promise.then(sendToCore => sendToCore(msg));

let deferredSetup: {
  promise: Promise<typeof sendToCore>;
  resolve: (sender: typeof sendToCore) => void;
}|undefined = {} as any;
deferredSetup!.promise = new Promise(resolve => {
	deferredSetup!.resolve = resolve;
});

const canSendBuffer = androidIPC.canSendBuffer();

// prepare to capture provided MessagePort and setup ipc
window.onmessage = (msgEvent: MessageEvent) => {
  if (!deferredSetup) {
    return;
  }
	const port = msgEvent.ports[0];
	sendToCore = (canSendBuffer ?
		msg => port.postMessage(msg, [ msg.buffer ]) :
		msg => port.postMessage((msg as any).toBase64())
	);
	deferredSetup.resolve(sendToCore);
	deferredSetup = undefined as any;
	port.onmessage = (canSendBuffer ?
		msgEvent => onMsgToJS(new Uint8Array(msgEvent.data)) :
		msgEvent => onMsgToJS((Uint8Array as any).fromBase64(msgEvent.data))
	);
}
// ask to send MessagePort
androidIPC.setupPort();

/**
 * This makes mechanism for IPC in WebView.
 * WebView has a clean way to inject functions into JS, needing mostly an addition of message passing, which is
 * also done in a clean way with web's MessageChannel mechanism, when it is available.
 */
export function makeIPC(): InitIPC {
	return {

		listObjOnServiceSide: path => {
			return JSON.parse(androidIPC.listObjPath(JSON.stringify(path)));
		},

		setHandlerOfMsgsFromCore: handler => {
			onMsgToJS = envBytes => {

				const msg = msgProtoType.unpack(toBuffer(envBytes));
				handler(msg);
			};
			return () => {
				onMsgToJS = noop;
			};
		},

		sendMsgToCore: (canSendBuffer ?
			msg => {
				// XXX note on this array copy before passing it to sending via WebMessage port:
				//  - protobuf throws "TypeError: Cannot perform Construct on a detached ArrayBuffer" from
				//    Writer.pool_alloc.
				//  - pool in the name suggests some reuse. But arrays get detached when sent from port.
				//  - thus, a guess to add copy here, .... and it works. But code looks nasty.
				const msgBytes = msgProtoType.pack(msg);
				const copyToSend = new Uint8Array(msgBytes.length);
				copyToSend.set(msgBytes);
				sendToCore(copyToSend);
			} :
			msg => sendToCore(msgProtoType.pack(msg))
		)

	};
};
