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

type RPCConnection = web3n.rpc.client.RPCConnection;
type PassedDatum = web3n.rpc.PassedDatum;
type Observer<T> = web3n.Observer<T>;


export interface TransformOpts {
	unpackReply?: ((reply: PassedDatum | undefined) => any) | 'noop';
	packRequest?: ((args: any[]) => PassedDatum | undefined) | 'noop';
}

function fnResultFromPassedDatum(data: PassedDatum|undefined, unpack: TransformOpts['unpackReply']): any {
	if (!data) { return; }
	if (unpack) {
		return ((unpack === 'noop') ? data.bytes : unpack(data));
	} else {
		return unpackDatum(data);
	}
}

function argsToPassedDatum(args: any[], pack: TransformOpts['packRequest']): PassedDatum|undefined {
	if (args === undefined) { return; }
	if (pack) {
		if (pack === 'noop') {
			if (!ArrayBuffer.isView(args[0])) {
				throw new Error(`Method returned non-binary, while no serialization is set`);
			}
			return { bytes: args[0] as Uint8Array };
		}
		return pack(args);
	}
	else {
		return packIntoDatum(args);
	}
}

export function makeReqRepMethodCaller<F extends Function>(
	connection: RPCConnection, method: string, transforms?: TransformOpts
): F {
	return (async (...args: any[]) => {
		const req = argsToPassedDatum(args, transforms?.packRequest);
		const callResult = await connection.makeRequestReplyCall(method, req);
		return fnResultFromPassedDatum(callResult, transforms?.unpackReply);
	}) as any as F;
}

export function makeObservableMethodCaller<F extends Function>(
	connection: RPCConnection, method: string, transforms?: TransformOpts
): F {
    return ((obs: Observer<any>, ...args: any[]) => {
        const req = argsToPassedDatum(args, transforms?.packRequest);
        const obsWrap: Observer<any> = {
            next: data => {
                if (!obs.next) {
                    return;
                }
                const ev = fnResultFromPassedDatum(data, transforms?.unpackReply);
                obs.next(ev);
            },
            complete: obs.complete,
            error: obs.error
        };
        return connection.startObservableCall(method, req, obsWrap);
    }) as any as F;
}

export function makeServiceCaller<T>(
	connection: RPCConnection,
	reqRepMethods?: (keyof T)[], obsMethods?: (keyof T)[],
	transforms?: { [method in keyof T]: TransformOpts; }
): Partial<T> {
    const caller = {} as T;
    if (reqRepMethods) {
        for (const method of reqRepMethods) {
            caller[method] = makeReqRepMethodCaller(
					connection, method as string,
					(transforms ? transforms[method] : undefined)
				) as any;
        }
    }
    if (obsMethods) {
        for (const method of obsMethods) {
            caller[method] = makeObservableMethodCaller(
					connection, method as string,
					(transforms ? transforms[method] : undefined)
				) as any;
        }
    }
    return caller;
}
