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
import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";
import { connectivity as pb } from "../../protos/connectivity.proto";
import { ObserversSet } from "../../../platform/lib-common/observer-utils";
import { Subscription, merge, interval, map, mergeMap } from "rxjs";

type ConnectivityCAP = web3n.connectivity.Connectivity;
type OnlineAssesment = web3n.connectivity.OnlineAssesment;
type ConnectivityEvent = web3n.connectivity.ConnectivityEvent;

const CHECK_INTERVAL_MILLIS = 30*1000;

export function makeConnectivity(connectivityEvents: Promise<Core['connectivityEvents']>): {
  makeCAP: () => { cap: ConnectivityCAP; }; close: () => void;
} {
	const observers = new ObserversSet<ConnectivityEvent>();
	let checkProc: Subscription|undefined = undefined;

  connectivityEvents.then(({ inbox$, storage$ }) => {
		checkProc = merge(
			interval(CHECK_INTERVAL_MILLIS)
			.pipe(
				mergeMap(async () => ({
					isOnline: await boolIsOnline()
				}))
			),
			inbox$
			.pipe(
				mergeMap(async ({ service, type, ping, error, slowSocket, socketClosed }) => ({
					isOnline: await boolIsOnline(),
					wsEvent: { service, type, ping, error, slowSocket, socketClosed }
				}))
			),
			storage$
			.pipe(
				mergeMap(async ({ service, type, ping, error, slowSocket, socketClosed }) => ({
					isOnline: await boolIsOnline(),
					wsEvent: { service, type, ping, error, slowSocket, socketClosed }
				}))
			)
    )
		.subscribe(observers);
  })
	.catch(() => {});

	function close() {
		checkProc?.unsubscribe();
		checkProc = undefined;
	}

	return {
		makeCAP: () => makeConnectivityCAP(observers),
		close
	};
}

const NETWORK_PRESENT_STATUS = 'network-present';
const NO_NETWORK_STATUS = 'no-network';

const isOnlineFn = wrapFnOnAndroidSide('connectivity_isOnline');
interface OnlineStatus { status: string; }
const onlineStatusType = ProtoType.for<OnlineStatus>(pb.OnlineStatus);

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

async function boolIsOnline(): Promise<boolean> {
  const status = await isOnline();
  return (status === 'online_80%');
}

function makeConnectivityCAP(observers: ObserversSet<ConnectivityEvent>): { cap: ConnectivityCAP; } {

	function watch(obs: web3n.Observer<ConnectivityEvent>): () => void {
		observers.add(obs);
		return () => observers.delete(obs);
	}

	return {
		cap: {
			isOnline,
			watch
		}
	};
}