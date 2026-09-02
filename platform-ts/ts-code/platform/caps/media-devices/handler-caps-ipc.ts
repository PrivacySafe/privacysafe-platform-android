/*
 Copyright (C) 2024 3NSoft Inc.
 
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

import { ExposedFn, Caller, CallerToClient, ClientSideServices, callerSideJSONWrap as jsonCall, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';
import { ObjectReference, ProtoType } from '../../lib-common/protobuf-msg';
import { common as pb } from '../../protos/common.proto';

type SetSelectDisplayMediaForCaptureHandler = web3n.media.SetSelectDisplayMediaForCaptureHandler;

export namespace setSelectDisplayMediaForCaptureHandler {

	const reqType = ProtoType.for<ObjectReference<'JsonCallFn'>>(
		pb.ObjectReference
	);

	export function expose(
		fn: SetSelectDisplayMediaForCaptureHandler,
		callerToClient: CallerToClient
	): ExposedFn {
		return buf => {
			const ref = reqType.unpack(buf);
			const promise = fn(jsonCall.makeReqRepFuncCaller(
				callerToClient as Caller, ref.path
			));
			return { promise };
		};
	}

	export function makeClient(
		caller: Caller, objPath: string[], expServices: ClientSideServices
	): SetSelectDisplayMediaForCaptureHandler {
		return async handler => {
			const expFn = jsonSrv.wrapReqReplyFunc(undefined as any, handler);
			const ref = expServices.exposeStaticService('JsonCallFn', expFn);
			await caller.startPromiseCall(objPath, reqType.pack(ref));
		}
	}

}
