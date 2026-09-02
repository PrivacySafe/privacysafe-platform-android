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

import { Observer, Subject } from "rxjs";
import { promiseClientSideW3N } from "../../platform/core/client-side-w3n";
import { ClientSide, Envelope, msgProtoType, ObjectsConnector } from "core-3nweb-client-lib/build/ipc";
import { toBuffer } from "../../platform/lib-common/buffer-utils";
import { defer, Deferred } from "../../platform/lib-common/processes/deferred";
import { listObjAsync } from "./ops/listCoreObjPath";
import { openBinaryMsgPort } from "./runtime-ipc-via-ports";

(async function() {

  async function makeClientSideConnector(): Promise<ClientSide> {
    const ipcPort = await openBinaryMsgPort('core-ipc', msg => coreListener(msgProtoType.unpack(toBuffer(msg))));
    const fromCore = new Subject<Envelope>();
    const coreListener = (msg: Envelope) => {
      if (msg.body) {
        msg.body.value = toBuffer(msg.body.value);
      }
      fromCore.next(msg);
    };
    const detachListener = () => ipcPort.close();
    const toClient = fromCore.asObservable();
    const fromClient = new Subject<Envelope>();
    fromClient.asObservable().subscribe({
      next: msg => ipcPort.send(msgProtoType.pack(msg)),
      error: detachListener,
      complete: detachListener
    } as Partial<Observer<Envelope>>);
    globalThis.ipc = undefined;
    return ObjectsConnector.makeClientSide(fromClient, toClient, undefined, listObjAsync);
  }

  let preloadDone: Deferred<void>|undefined = defer<void>();

  makeClientSideConnector()
  .then(clientSide => promiseClientSideW3N(clientSide))
  .then(w3n => {
    (globalThis as any).w3n = w3n;
    preloadDone?.resolve();
    preloadDone = undefined;
  });

  (globalThis as any)._awaitPreloadInit = () => preloadDone?.promise;

  (globalThis as any).Deno = {};

})();
