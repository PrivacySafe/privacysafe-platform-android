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
import { openBinaryMsgPort, stringToUtf8Bytes, utf8StringFromBytes, wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { Subject } from "rxjs";
import { request_op as pb } from "../../protos/request.proto";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import type { OutgoingHttpHeaders } from "http";

export function makeRequestFromAndroid(): {
  requestFromAndroid: RequestFn<unknown>;
  openServiceEventsSource: NetClient['openEventSource']
} {
  return { requestFromAndroid, openServiceEventsSource };
}

const requestFn = wrapFnOnAndroidSide('http_request');

type HeadersArray = { name: string;  value: string; }[];

interface RequestPB {
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
const requestPBType = ProtoType.for<RequestPB>(pb.RequestArgs);
function packRequest(
  {
    method, url, requestHeaders, responseHeaders, responseType, sessionId, timeout, timeoutRetries
  }: RequestOpts, reqContentType: ContentType|undefined, body: Uint8Array|undefined
): Buffer {
  return requestPBType.pack({
    method, sessionId, timeout, timeoutRetries, responseType, responseHeaders,
    url: url!,
    requestHeaders: toHeadersArr(requestHeaders),
    contentType: reqContentType,
    body: body ?? new Uint8Array(0)
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
  opts: RequestOpts, reqContentType?: ContentType, reqBody?: Uint8Array
): Promise<Reply<T>> {
  return unpackReplyPB(
    await requestFn(packRequest(opts, reqContentType, reqBody)),
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
interface OpenWSArgs { url: string; sessionId: string; }
const openWSArgsType = ProtoType.for<OpenWSArgs>(pb.OpenWSArgs);
interface WSOpeningReply { status: number; socketId: number; }
const wsOpeningReplyType = ProtoType.for<WSOpeningReply>(pb.WSOpeningReply);

async function openServiceEventsSource(req: RequestOpts): ReturnType<OpenServiceEventsSource> {
  const { status, socketId } = wsOpeningReplyType.unpack(
    await wsOpenFn(openWSArgsType.pack({ url: req.url!, sessionId: req.sessionId! }))
  );
  if (status !== 200) {
    return { status, data: undefined as any };
  }

  const msgs = new Subject<Envelope>();
  const heartbeats = new Subject<ConnectionStatus>();

  const port = await openBinaryMsgPort(`ws_#${socketId}`, msg => {
    try {
      msgs.next(JSON.parse(utf8StringFromBytes(msg)));
    } catch (err) {
      console.error(err);
    }
  });

  const srvEvents: ServiceEventsSource = {

    comm: {
      postMessage: m => port.send(stringToUtf8Bytes(JSON.stringify(m))),
      subscribe: obs => {
        const sub = msgs.subscribe(obs);
        return () => {
          sub.unsubscribe();
          port.close();
        };
      }
    },

    watch: obs => {
      const sub = heartbeats.subscribe(obs);
      return () => {
        sub.unsubscribe();
      };
    }

  };

  return { status, data: srvEvents };
}
