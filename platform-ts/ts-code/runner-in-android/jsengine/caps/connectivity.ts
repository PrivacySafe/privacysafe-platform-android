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

import { Core } from "core-3nweb-client-lib";
import { Subject } from "rxjs";
import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import { connectivity as pb } from "../../protos/connectivity.proto";

type ConnectivityCAP = web3n.connectivity.Connectivity;
type OnlineAssesment = web3n.connectivity.OnlineAssesment;
type ConnectivityEvent = web3n.connectivity.ConnectivityEvent;
type Observer<T> = web3n.Observer<T>;

export function makeConnectivity(connectivityEvents: Promise<Core['connectivityEvents']>): {
  makeCAP: () => { cap: ConnectivityCAP; }; close: () => void;
} {
  const events = new Subject<ConnectivityEvent>();

  connectivityEvents.then(srvEvents => {
    const { inbox$, storage$ } = srvEvents;
    inbox$.subscribe({
      next: inboxStatus => events.next({
        isOnline: !!inboxStatus.ping,
        wsEvent: inboxStatus
      })
    });
    storage$.subscribe({
      next: storageStatus => events.next({
        isOnline: !!storageStatus.ping,
        wsEvent: storageStatus
      })
    });
  });

  async function isOnline(): Promise<OnlineAssesment> {
    const { status } = onlineStatusType.unpack(await isOnlineFn());
    switch (status) {
      case NETWORK_PRESENT_STATUS: return 'online_80%';
      case NO_NETWORK_STATUS: return 'offline_99%';
      default: {
        console.error(`connectivity_isOnline returns from Android side an unknown status value '${status}'`);
        return 'offline_99%';
      }
    }
  }

  function watch(obs: Observer<ConnectivityEvent>): (() => void) {
    const sub = events.asObservable().subscribe(obs);
    return () => sub.unsubscribe();
  }

  function makeCAP(): { cap: ConnectivityCAP; } {

    return { cap: { isOnline, watch } };
  }

  function close() {}

  return { makeCAP, close };
}

const NETWORK_PRESENT_STATUS = 'network-present';
const NO_NETWORK_STATUS = 'no-network';

const isOnlineFn = wrapFnOnAndroidSide('connectivity_isOnline');
interface OnlineStatus { status: string; }
const onlineStatusType = ProtoType.for<OnlineStatus>(pb.OnlineStatus);
