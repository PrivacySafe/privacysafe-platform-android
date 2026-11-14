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

import type { RequestFn, Reply, RequestOpts, Headers, ContentType, NetClient, OpenServiceEventsSource, ServiceEventsSource, ConnectionStatus } from "core-3nweb-client-lib/build/lib-client/request-utils";
import type { Envelope } from "core-3nweb-client-lib/build/lib-common/ipc/generic-ipc";
import { fnsForAndroid, openBinaryMsgPort, utf8StringFromBytes, wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { share, Subject } from "rxjs";
import { request_op as pb } from "../../protos/request.proto";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import type { OutgoingHttpHeaders } from "http";
import { makeConnectionException } from "../../../platform/lib-common/exceptions/http";
import { makeRuntimeException } from "../../../platform/lib-common/exceptions/runtime";

export function makeRequestFromAndroid(netId: string): {
  requestFromAndroid: RequestFn<unknown>;
  openServiceEventsSource: NetClient['openEventSource']
} {
  exposeWSEventSinkIfNeeded();
  return {
    requestFromAndroid: (
      opts, reqContentType, reqBody
    ) => requestFromAndroid(netId, opts, reqContentType, reqBody),
    openServiceEventsSource: (req) => openServiceEventsSource(netId, req)
  };
}

const requestFn = wrapFnOnAndroidSide('http_request');

type HeadersArray = { name: string;  value: string; }[];

interface RequestArgsPB {
  netId: string;
  opts: RequestOptsPB;
}
interface RequestOptsPB {
  method: string;
  url: string;
  responseType?: string;
  sessionId?: string;
  requestHeaders?: HeadersArray;
  responseHeaders?: string[];
  timeout?: number;
  timeoutRetries?: number;
  contentType?: string;
  body?: Uint8Array;
}
const requestPBType = ProtoType.for<RequestArgsPB>(pb.RequestArgs);
function packRequest(
  netId: string,
  {
    method, url, requestHeaders, responseHeaders, responseType, sessionId, timeout, timeoutRetries
  }: RequestOpts, reqContentType: ContentType|undefined, body: Uint8Array|undefined
): Buffer {
  return requestPBType.pack({
    netId, opts: {
      method, sessionId, timeout, timeoutRetries, responseType, responseHeaders,
      url: url!,
      requestHeaders: toHeadersArr(requestHeaders),
      contentType: reqContentType,
      body: body ?? new Uint8Array(0)
    }
  });
}

function toHeadersArr(headers: OutgoingHttpHeaders|undefined): HeadersArray|undefined {
  if (!headers) {
    return;
  }
  const hArr: HeadersArray = [];
  for (const [ name, value ] of Object.entries(headers)) {
    if (!value) {
      continue;
    }
    hArr.push({
      name,
      value: ((typeof value === 'string') ? value :
        Array.isArray(value) ? value.join('') : `${value}`
      )
    });
  }
  return hArr;
}

interface ReplyPB {
  status: number;
  responseHeaders: HeadersArray;
  body?: Uint8Array;
}
const replyPBType = ProtoType.for<ReplyPB>(pb.Reply);
function unpackReplyPB<T>(
  replyPB: Buffer, { method, url, responseType, responseHeaders: headersToPass }: RequestOpts
): Reply<T> {
  const { body, status, responseHeaders } = replyPBType.unpack(replyPB);

  let headers: Reply<unknown>['headers'] = undefined;
  if (headersToPass && (headersToPass.length > 0)) {
    const hValues = new Map<string, string>();
    for (const h of headersToPass) {
      const hName = h.toLowerCase();
      for (const { name, value } of responseHeaders) {
        if (name.toLowerCase() === hName) {
          hValues.set(hName, value);
        }
      }
    }
    headers = {
  		get: (name: string) => hValues.get(name.toLowerCase())
    };
  }

  let data: any = undefined;
  if (responseType && body) {
    try {
      switch (responseType) {
        case 'json': {
          data = JSON.parse(utf8StringFromBytes(body));
          break;
        }
        case 'arraybuffer': {
          data = body;
          break;
        }
        case 'text': {
          data = utf8StringFromBytes(body);
          break;
        }
      }
    } catch (err) {}
  }

  return { method, url: url!, status, headers, data };
}

async function requestFromAndroid<T>(
  netId: string, opts: RequestOpts, reqContentType?: ContentType, reqBody?: Uint8Array
): Promise<Reply<T>> {
  return unpackReplyPB(
    await requestFn(packRequest(netId, opts, reqContentType, reqBody))
    .catch(err => {
      throw makeConnectionException(opts.url, `Error in making a request`, err);
    }),
    opts
  );
}

function makeHeaders(headers: { [h:string]: string; }): Headers {
	return {
		get(name: string): string|undefined {
			return headers[name.toLowerCase()];
		}
	};
}

const wsOpenFn = wrapFnOnAndroidSide('ws_open');
interface OpenWSArgs { netId: string; url: string; sessionId: string; }
const openWSArgsType = ProtoType.for<OpenWSArgs>(pb.OpenWSArgs);
interface WSOpeningReply { status: number; socketId?: number; }
const wsOpeningReplyType = ProtoType.for<WSOpeningReply>(pb.WSOpeningReply);

async function openWSOnAndroidSide(netId: string, url: string, sessionId: string): Promise<{ status: number; socketId?: number; }> {
  const reply = await wsOpenFn(openWSArgsType.pack({ netId, url, sessionId }))
  .catch(err => {
    throw makeConnectionException(url, `Error in making a request to open WebSocket`, err);
  });
  return wsOpeningReplyType.unpack(reply);
}

const wsCallFn = wrapFnOnAndroidSide('ws_call');
interface CallWSArg { socketId: number, cmd: 'msg'|'close'|'ping'; msg?: string; }
const wsCallType = ProtoType.for<CallWSArg>(pb.CallWSArg);
interface CallWSReply { status: 'ok'|'ws-not-found' };
const wsCallReplyType = ProtoType.for<CallWSReply>(pb.CallWSReply);

async function callWSOnAndroidSide(socketId: number, cmd: CallWSArg['cmd'], msg?: string) {
  try {
    const reply = await wsCallFn(wsCallType.pack({ socketId, cmd, msg }));
    const { status } = wsCallReplyType.unpack(reply);
    return (status === 'ok');
  } catch (err) {
    console.error(`WTF`, err);
    throw err;
  }
}

interface WebSocketEvent {
  socketId: number; event: 'msg'|'closed'|'failed'|'pong'; msg?: string; code?: number; reason?: string;
}

type WSEventSink = {
  msgs: Subject<Envelope>;
  close: () => void;
} & Pick<ReturnType<typeof makeHeartbeat>, 'healthyBeat' | 'otherBeat'>;

const sinksForEventsFromWSOnAndroid = new Map<number, WSEventSink>();

async function absorbWebSocketEvent({ socketId, event, msg, code, reason }: WebSocketEvent): Promise<void> {
  const sink = sinksForEventsFromWSOnAndroid.get(socketId);
  if (!sink) {
    return;
  }
  const { msgs, healthyBeat, otherBeat, close } = sink;
  try {
    if (event === 'msg') {
      msgs.next(JSON.parse(msg!));
      healthyBeat();
    } else if (event === 'pong') {
      healthyBeat();
    } else if (event === 'closed') {
      otherBeat('disconnected', { socketClosed: true }, true);
      msgs.error(makeWSException({
        socketClosed: true,
      }));
      close();
    } else if (event === 'failed') {
      if (code === 1000) {
        otherBeat('disconnected', { socketClosed: true }, true);
        msgs.error(makeWSException({
          socketClosed: true,
        }));
        close();
      } else {
        const cause = { error: { code, reason }, socketClosed: true as true };
        otherBeat('disconnected', cause, true);
        msgs.error(makeWSException({
          socketClosed: true,
          cause
        }));
        close();
      }
    }
  } catch (err) {
    otherBeat('disconnected', { error: err, socketClosed: true }, true);
    msgs.error(makeWSException({ cause: err }));
    close();
  }
}

let isSinkForWSEventsFromAndroidExposed = false;
function exposeWSEventSinkIfNeeded() {
  if (isSinkForWSEventsFromAndroidExposed) {
    return;
  }
  fnsForAndroid.exposeFn(
    absorbWebSocketEvent,
    ProtoType.for<WebSocketEvent>(pb.WebSocketEvent),
    undefined
  );
  isSinkForWSEventsFromAndroidExposed = true;
}

async function openServiceEventsSource(netId: string, req: RequestOpts): ReturnType<OpenServiceEventsSource> {
  const { status, socketId } = await openWSOnAndroidSide(netId, req.url!, req.sessionId!);
  if (status !== 200) {
    return { status, data: undefined as any };
  } else if (!socketId) {
    throw new Error(`Missing socket id, while status is 200`);
  }

  // Note: OkHttp (on Android side) is sending own ping requests, closing connection and notifying only
  //       when pongs ain't coming back from server. So, we ask/ping Android side, if socket is open, and it
  //       works around OkHttp api shape.

  function pingWSOnAndroid() {
    try {
      callWSOnAndroidSide(socketId!, 'ping');
    } catch (err) {
      msgs.error(makeWSException({
        socketClosed: true,
        cause: err
      }));
      otherBeat('disconnected', { error: err }, true);
      close();
    }
  }

  function close() {
    sinksForEventsFromWSOnAndroid.delete(socketId!);
    clearInterval(pingRepeat);
    callWSOnAndroidSide(socketId!, 'close');
  }

  const pingRepeat = setInterval(pingWSOnAndroid, 10000);

  const msgs = new Subject<Envelope>();
	const { heartbeat, healthyBeat, otherBeat } = makeHeartbeat(req.url!);
  sinksForEventsFromWSOnAndroid.set(socketId, { msgs, healthyBeat, otherBeat, close });
  const srvEvents: ServiceEventsSource = {

    comm: {
      postMessage: m => {
        callWSOnAndroidSide(socketId, 'msg', JSON.stringify(m));
      },
      subscribe: obs => {
        const sub = msgs.subscribe(obs);
        return () => {
          sub.unsubscribe();
          close();
        };
      }
    },

    watch: obs => {
      const sub = heartbeat.subscribe(obs);
      return () => sub.unsubscribe();
    }

  };

  return { status, data: srvEvents };
}

export interface WSException extends web3n.RuntimeException {
	type: 'websocket',
	socketSlow?: true,
	socketClosed?: true
}

export function makeWSException(params: Partial<WSException>, flags?: Partial<WSException>): WSException {
	return makeRuntimeException('websocket', params, flags ?? {});
}

function makeHeartbeat(url: string) {

	const status = new Subject<ConnectionStatus>();

	let lastInfo = Date.now();

	function healthyBeat(): void {
		const now = Date.now();
		status.next({
			type: 'heartbeat',
			url,
			ping: now - lastInfo
		});
		lastInfo = now;
	}

	function otherBeat(type: ConnectionStatus['type'], params: Partial<ConnectionStatus>, end = false): void {
		status.next({
			type,
			url,
			...params				
		});
		if (end) {
			status.complete();
		}
	}

	return {
		heartbeat: status.asObservable().pipe(share()),
		healthyBeat,
		otherBeat
	};
}
